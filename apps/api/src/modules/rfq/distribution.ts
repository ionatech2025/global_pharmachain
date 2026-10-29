import { type CompanyType, effectiveRfqStatus, formatNoticeTime } from "@pharmachain/core";
import { prisma } from "@pharmachain/db";
import { genericEventEmail } from "@pharmachain/email";
import { notifyOrThrow } from "@pharmachain/notifications";
import { env } from "../../env";
import { logger } from "../../lib/logger";
import { emitWebhookEvent } from "../../lib/webhooks";

/** How long a claimed delivery may stay unconfirmed before another attempt may take it. */
const LEASE_MS = 5 * 60 * 1000;

/** Roles that can quote; Finance cannot, so it is not told about RFQs. */
const QUOTING_ROLES = ["COMPANY_ADMIN", "OPERATIONS"] as const;

/**
 * The supplier inbox rule as a list of companies — the same rule rfqReach
 * counts and the inbox filters on: verified, of the target type, not the buyer,
 * and, when the RFQ names a category, with a published listing in it.
 */
export async function eligibleSupplierIds(rfq: {
  buyerCompanyId: string;
  targetCompanyType: CompanyType;
  categoryId: string | null;
}): Promise<string[]> {
  const rows = await prisma.company.findMany({
    where: {
      type: rfq.targetCompanyType,
      verificationStatus: "VERIFIED",
      id: { not: rfq.buyerCompanyId },
      ...(rfq.categoryId
        ? { listings: { some: { status: "PUBLISHED", categoryId: rfq.categoryId } } }
        : {}),
    },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/**
 * Deliver an RFQ to every eligible supplier — at least once each.
 *
 * Until this existed a new RFQ reached nobody: suppliers found it only by
 * opening their inbox, while the deadline clock was already running. And there
 * was no record of who had been given it, so an addendum or a cancellation
 * could not reach "every supplier to which the solicitation was provided"
 * (UNCITRAL Model Law arts. 28(2), 30(4)).
 *
 * Every recipient gets a row first. A row is claimed with a compare-and-set
 * lease before its notice is sent and stamped delivered only after the send
 * succeeds, so two attempts never both send it, and a crash in between leaves
 * it to be retried by the rfq-distribution job rather than lost. Safe to call
 * any number of times.
 */
export async function distributeRfq(
  rfqId: string,
  now = new Date(),
): Promise<{ delivered: number; failed: number }> {
  const rfq = await prisma.rfq.findUnique({
    where: { id: rfqId },
    include: {
      buyerCompany: { select: { name: true } },
      category: { select: { name: true } },
    },
  });
  if (!rfq || rfq.distributedAt) return { delivered: 0, failed: 0 };
  if (effectiveRfqStatus(rfq.status, rfq.deadline, now) !== "OPEN") {
    // Closed, awarded or cancelled before it went out: nothing left to announce.
    await prisma.rfq.updateMany({
      where: { id: rfqId, distributedAt: null },
      data: { distributedAt: now },
    });
    return { delivered: 0, failed: 0 };
  }

  const recipients = await eligibleSupplierIds(rfq);
  if (recipients.length > 0) {
    await prisma.rfqDistribution.createMany({
      data: recipients.map((companyId) => ({ rfqId, companyId })),
      skipDuplicates: true,
    });
  }

  const leaseExpired = new Date(now.getTime() - LEASE_MS);
  const pending = await prisma.rfqDistribution.findMany({
    where: {
      rfqId,
      deliveredAt: null,
      OR: [{ claimedAt: null }, { claimedAt: { lt: leaseExpired } }],
    },
    select: { id: true, companyId: true, claimedAt: true },
  });

  const deadline = formatNoticeTime(rfq.deadline);
  const url = `${env.APP_URL}/rfqs/${rfq.id}`;
  const what = `${rfq.quantity.toString()} ${rfq.unit}${rfq.category ? ` (${rfq.category.name})` : ""}`;
  const delivered: string[] = [];
  let failed = 0;
  for (const row of pending) {
    // Compare-and-set on the claim we read: of two concurrent attempts only one matches.
    const claim = await prisma.rfqDistribution.updateMany({
      where: { id: row.id, deliveredAt: null, claimedAt: row.claimedAt },
      data: { claimedAt: now, attempts: { increment: 1 } },
    });
    if (claim.count === 0) continue;
    try {
      await notifyOrThrow({
        companyId: row.companyId,
        roles: [...QUOTING_ROLES],
        type: "NEW_RFQ",
        title: `New RFQ ${rfq.refNo}: ${rfq.title}`,
        body: `${rfq.buyerCompany.name} requests ${what}. Quotations close ${deadline}.`,
        href: `/rfqs/${rfq.id}`,
        emailContent: genericEventEmail({
          title: "New RFQ you can quote on",
          body: `${rfq.buyerCompany.name} has published RFQ ${rfq.refNo} — ${rfq.title}: ${what}.\n\nQuotations close ${deadline}.`,
          url,
          cta: "View the RFQ",
        }),
        whatsappText: `PharmaChain: new RFQ ${rfq.refNo} from ${rfq.buyerCompany.name}, closes ${deadline}. ${url}`,
      });
      await prisma.rfqDistribution.update({
        where: { id: row.id },
        data: { deliveredAt: new Date() },
      });
      delivered.push(row.companyId);
    } catch (err) {
      failed++;
      logger.warn("rfq delivery failed; the rfq-distribution job retries it", {
        rfqId,
        error: String(err),
      });
    }
  }

  if (delivered.length > 0) {
    await emitWebhookEvent(delivered, "rfq.published", {
      rfqId: rfq.id,
      refNo: rfq.refNo,
      title: rfq.title,
      quantity: rfq.quantity.toString(),
      unit: rfq.unit,
      category: rfq.category?.name ?? null,
      deadline: rfq.deadline.toISOString(),
      buyer: rfq.buyerCompany.name,
      url,
    });
  }
  const remaining = await prisma.rfqDistribution.count({ where: { rfqId, deliveredAt: null } });
  if (remaining === 0) {
    await prisma.rfq.updateMany({
      where: { id: rfqId, distributedAt: null },
      data: { distributedAt: new Date() },
    });
  }
  return { delivered: delivered.length, failed };
}

/**
 * Every supplier an RFQ reached: those it was delivered to, and any that quoted
 * (RFQs raised before delivery was recorded have no rows). Addenda, deadline
 * extensions and cancellations go to all of them.
 */
export async function rfqAudience(rfqId: string): Promise<string[]> {
  const [delivered, quoted] = await Promise.all([
    prisma.rfqDistribution.findMany({
      where: { rfqId, deliveredAt: { not: null } },
      select: { companyId: true },
    }),
    prisma.quotation.findMany({
      where: { rfqId },
      select: { supplierCompanyId: true },
      distinct: ["supplierCompanyId"],
    }),
  ]);
  return [
    ...new Set([...delivered.map((d) => d.companyId), ...quoted.map((q) => q.supplierCompanyId)]),
  ];
}

/** Safety net for deliveries a request could not finish (crash, timeout, a
 *  failed send). The request path delivers at once; this only mops up. */
export async function runRfqDistributionJob(now = new Date()): Promise<void> {
  const stale = new Date(now.getTime() - 60 * 1000);
  const due = await prisma.rfq.findMany({
    where: { distributedAt: null, createdAt: { lt: stale } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  let delivered = 0;
  let failed = 0;
  for (const { id } of due) {
    const result = await distributeRfq(id, now);
    delivered += result.delivered;
    failed += result.failed;
  }
  if (due.length > 0)
    logger.info("rfq-distribution job done", { rfqs: due.length, delivered, failed });
}
