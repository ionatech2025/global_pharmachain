import type { UsageEvaluation } from "@pharmachain/core";
import { evaluateUsage, PARAM_KEYS, startOfUtcMonth } from "@pharmachain/core";
import type { CreditKind, Prisma, SubscriptionTier } from "@pharmachain/db";
import { prisma } from "@pharmachain/db";
import { getIntParam } from "../../lib/params";

type Tx = Prisma.TransactionClient;

async function countUsed(
  tx: Tx,
  companyId: string,
  kind: CreditKind,
  since: Date,
): Promise<number> {
  if (kind === "RFQ") {
    return tx.rfq.count({ where: { buyerCompanyId: companyId, createdAt: { gte: since } } });
  }
  return tx.quotation.count({
    where: { supplierCompanyId: companyId, createdAt: { gte: since }, version: 1 },
  });
}

async function confirmedCredits(
  tx: Tx,
  companyId: string,
  kind: CreditKind,
  since: Date,
): Promise<number> {
  const agg = await tx.creditRequest.aggregate({
    _sum: { count: true },
    where: { companyId, kind, status: "CONFIRMED", decidedAt: { gte: since } },
  });
  return agg._sum.count ?? 0;
}

/**
 * Freemium accounting (US-906/907): effective limit = tier base parameter +
 * credits confirmed this UTC calendar month; usage = rows created this month.
 * The month boundary is implicit — no reset job.
 */
export async function evaluateCompanyUsage(
  tx: Tx,
  companyId: string,
  tier: SubscriptionTier,
  kind: CreditKind,
  now = new Date(),
): Promise<UsageEvaluation> {
  const baseLimit = await getIntParam(
    kind === "RFQ"
      ? PARAM_KEYS.FREEMIUM_RFQ_MONTHLY_LIMIT
      : PARAM_KEYS.FREEMIUM_QUOTATION_MONTHLY_LIMIT,
  );
  const since = startOfUtcMonth(now);
  const [used, credits] = await Promise.all([
    countUsed(tx, companyId, kind, since),
    confirmedCredits(tx, companyId, kind, since),
  ]);
  return evaluateUsage({ tier, baseLimit, confirmedCredits: credits, used });
}

export async function getUsageSummary(companyId: string, tier: SubscriptionTier) {
  const [rfq, quotation] = await Promise.all([
    evaluateCompanyUsage(prisma, companyId, tier, "RFQ"),
    evaluateCompanyUsage(prisma, companyId, tier, "QUOTATION"),
  ]);
  return { rfq, quotation };
}
