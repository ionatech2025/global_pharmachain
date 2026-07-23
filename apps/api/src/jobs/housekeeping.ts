import { prisma } from "@pharmachain/db";
import { genericEventEmail } from "@pharmachain/email";
import { notify } from "@pharmachain/notifications";
import { env } from "../env";
import { logger } from "../lib/logger";
import { deleteObject } from "../modules/document/storage";

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

/**
 * Requested uploads that were never completed (browser closed, PUT failed)
 * leave invisible Document rows and possibly partial objects behind. After a
 * generous grace period both are removed; supersede markers pointing at an
 * abandoned replacement are unwound so the old version stays current.
 */
export async function runUploadCleanupJob(now = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const stale = await prisma.document.findMany({
    where: { uploadCompletedAt: null, createdAt: { lt: cutoff } },
    select: { id: true, storageKey: true },
    take: 500,
  });
  if (stale.length === 0) return;

  for (const doc of stale) {
    try {
      await deleteObject(doc.storageKey);
    } catch (err) {
      // Best-effort: the row is removed regardless; a leaked object without a
      // row is unreachable (keys are random UUIDs) and caught by bucket audit.
      logger.warn("upload cleanup: object delete failed", {
        storageKey: doc.storageKey,
        error: String(err),
      });
    }
  }

  const ids = stale.map((d) => d.id);
  await prisma.$transaction([
    prisma.document.updateMany({
      where: { supersededById: { in: ids } },
      data: { supersededById: null },
    }),
    prisma.document.deleteMany({ where: { id: { in: ids }, uploadCompletedAt: null } }),
  ]);
  logger.info("upload cleanup job done", { removed: ids.length });
}

/**
 * US-1003: the 30-day data-subject-request SLA is enforced server-side, not
 * just painted in the admin UI — approaching (≤7 days left) and overdue
 * requests page the super admins daily until actioned.
 */
export async function runDsrSlaJob(now = new Date()): Promise<void> {
  const slaDays = 30;
  const warnAt = new Date(now.getTime() - (slaDays - 7) * 24 * 60 * 60 * 1000);
  const pending = await prisma.dataDeletionRequest.findMany({
    where: { status: "PENDING", createdAt: { lt: warnAt } },
    include: { user: { select: { email: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (pending.length === 0) return;
  const superAdmins = await prisma.user.findMany({
    where: { isSuperAdmin: true, status: "ACTIVE" },
    select: { id: true },
  });
  const overdue = pending.filter(
    (r) => now.getTime() - r.createdAt.getTime() > slaDays * 24 * 60 * 60 * 1000,
  );
  const summary =
    overdue.length > 0
      ? `${overdue.length} deletion request(s) are PAST the ${slaDays}-day SLA`
      : `${pending.length} deletion request(s) are within 7 days of the ${slaDays}-day SLA`;
  await notify({
    userIds: superAdmins.map((u) => u.id),
    type: "DATA_REQUEST",
    title: overdue.length > 0 ? "GDPR SLA breached" : "GDPR SLA approaching",
    body: `${summary}. Oldest: ${pending[0]?.user.email ?? "?"} (${pending[0]?.createdAt.toDateString()}).`,
    href: "/admin/data-requests",
    emailContent: genericEventEmail({
      title: "Data deletion requests need action",
      body: `${summary}. Process them in the data-requests queue.`,
      url: `${env.APP_URL}/admin/data-requests`,
      cta: "Open the queue",
    }),
  });
  logger.info("dsr sla job done", { pending: pending.length, overdue: overdue.length });
}

/** Drops rate-limit buckets whose window and block have both long passed. */
export async function runThrottleCleanupJob(now = new Date()): Promise<void> {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const result = await prisma.throttleBucket.deleteMany({
    where: {
      expiresAt: { lt: cutoff },
      OR: [{ blockedUntil: null }, { blockedUntil: { lt: cutoff } }],
    },
  });
  if (result.count > 0) logger.info("throttle cleanup job done", { removed: result.count });
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
