import { prisma } from "@pharmachain/db";
import { genericEventEmail } from "@pharmachain/email";
import { notify } from "@pharmachain/notifications";
import { env } from "../env";
import { logger } from "../lib/logger";

/** RFQs past their deadline auto-close (US-402); buyers are told. */
export async function runRfqAutoCloseJob(now = new Date()): Promise<void> {
  const due = await prisma.rfq.findMany({
    where: { status: "OPEN", deadline: { lt: now } },
    select: { id: true, refNo: true, title: true, buyerCompanyId: true, createdById: true },
  });
  if (due.length === 0) return;
  await prisma.rfq.updateMany({
    where: { id: { in: due.map((r) => r.id) } },
    data: { status: "CLOSED", closedAt: now },
  });
  await Promise.all(
    due.map((rfq) =>
      notify({
        userIds: [rfq.createdById],
        type: "RFQ_STATUS_CHANGE",
        title: "RFQ closed",
        body: `${rfq.refNo} — ${rfq.title} — reached its deadline. Compare the quotations and award.`,
        href: `/rfqs/${rfq.id}`,
        emailContent: genericEventEmail({
          title: "Your RFQ closed",
          body: `RFQ ${rfq.refNo} — ${rfq.title} — reached its response deadline.`,
          url: `${env.APP_URL}/rfqs/${rfq.id}`,
          cta: "Compare quotations",
        }),
      }),
    ),
  );
  logger.info("rfq auto-close job done", { closed: due.length });
}

/** Quotations past their validity window expire (US-404). */
export async function runQuotationExpiryJob(now = new Date()): Promise<void> {
  const result = await prisma.quotation.updateMany({
    where: { status: "ACTIVE", validUntil: { lt: now } },
    data: { status: "EXPIRED" },
  });
  if (result.count > 0) logger.info("quotation expiry job done", { expired: result.count });
}

/** Clears consumed/expired short-lived credentials. */
export async function runTokenCleanupJob(now = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [otps, resets] = await prisma.$transaction([
    prisma.emailOtp.deleteMany({
      where: { OR: [{ expiresAt: { lt: cutoff } }, { consumedAt: { lt: cutoff } }] },
    }),
    prisma.passwordResetToken.deleteMany({
      where: { OR: [{ expiresAt: { lt: cutoff } }, { consumedAt: { lt: cutoff } }] },
    }),
  ]);
  if (otps.count + resets.count > 0) {
    logger.info("token cleanup job done", { otps: otps.count, resets: resets.count });
  }
}
