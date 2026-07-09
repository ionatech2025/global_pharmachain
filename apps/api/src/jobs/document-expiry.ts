import { DOCUMENT_KIND_LABELS, PARAM_KEYS } from "@pharmachain/core";
import { prisma } from "@pharmachain/db";
import { genericEventEmail } from "@pharmachain/email";
import { notify } from "@pharmachain/notifications";
import { env } from "../env";
import { daysUntil, shouldAlertExpiry } from "../lib/expiry";
import { logger } from "../lib/logger";
import { getCsvIntParam } from "../lib/params";

/**
 * Daily expiry sweep (US-104):
 *  1. Alert companies at configured thresholds before a document expires.
 *  2. Flag VERIFIED companies whose compliance documents have expired.
 *  3. Flag companies whose 3-year re-verification is due.
 */
export async function runDocumentExpiryJob(now = new Date()): Promise<void> {
  const thresholds = await getCsvIntParam(PARAM_KEYS.DOC_EXPIRY_ALERT_DAYS);
  const horizon = new Date(now.getTime() + Math.max(...thresholds, 60) * 24 * 60 * 60 * 1000);

  // 1. Upcoming expiries → threshold-crossing alerts
  const upcoming = await prisma.document.findMany({
    where: {
      status: "ACTIVE",
      uploadCompletedAt: { not: null },
      expiresAt: { gte: now, lte: horizon },
    },
    include: { ownerCompany: { select: { id: true, name: true } } },
  });
  let alerts = 0;
  for (const doc of upcoming) {
    if (!doc.expiresAt) continue;
    if (
      !shouldAlertExpiry({
        expiresAt: doc.expiresAt,
        lastAlertAt: doc.lastExpiryAlertAt,
        now,
        thresholds,
      })
    ) {
      continue;
    }
    const daysLeft = daysUntil(doc.expiresAt, now);
    await notify({
      companyId: doc.ownerCompanyId,
      roles: ["COMPANY_ADMIN"],
      type: "DOCUMENT_EXPIRY",
      title: `${DOCUMENT_KIND_LABELS[doc.kind]} expires in ${daysLeft} day(s)`,
      body: `${doc.fileName} expires on ${doc.expiresAt.toDateString()}. Upload a renewal to stay verified.`,
      href: "/company/verification",
      emailContent: genericEventEmail({
        title: `Document expiring in ${daysLeft} day(s)`,
        body: `${DOCUMENT_KIND_LABELS[doc.kind]} (${doc.fileName}) expires on ${doc.expiresAt.toDateString()}. Upload a renewal to avoid losing verified status.`,
        url: `${env.APP_URL}/company/verification`,
        cta: "Upload renewal",
      }),
    });
    await prisma.document.update({
      where: { id: doc.id },
      data: { lastExpiryAlertAt: now },
    });
    alerts++;
  }

  // 2. Expired documents → EXPIRED_DOCUMENT flag on verified companies
  const expiredDocs = await prisma.document.findMany({
    where: {
      status: "ACTIVE",
      uploadCompletedAt: { not: null },
      expiresAt: { lt: now },
      ownerCompany: { verificationStatus: "VERIFIED" },
      kind: {
        in: [
          "CERTIFICATE_OF_INCORPORATION",
          "TRADING_LICENCE",
          "TAX_ID",
          "IMPORT_EXPORT_LICENCE",
          "MANUFACTURING_LICENCE",
          "GMP_CERTIFICATE",
        ],
      },
    },
    select: { ownerCompanyId: true, fileName: true, kind: true },
  });
  const flaggedCompanies = [...new Set(expiredDocs.map((d) => d.ownerCompanyId))];
  for (const companyId of flaggedCompanies) {
    await prisma.company.updateMany({
      where: { id: companyId, verificationStatus: "VERIFIED" },
      data: { verificationStatus: "EXPIRED_DOCUMENT" },
    });
    await notify({
      companyId,
      roles: ["COMPANY_ADMIN"],
      type: "DOCUMENT_EXPIRY",
      title: "A compliance document has expired",
      body: "Your company is flagged until a renewal is uploaded and re-approved.",
      href: "/company/verification",
    });
  }
  if (flaggedCompanies.length > 0) {
    const superAdmins = await prisma.user.findMany({
      where: { isSuperAdmin: true, status: "ACTIVE" },
      select: { id: true },
    });
    await notify({
      userIds: superAdmins.map((u) => u.id),
      type: "DOCUMENT_EXPIRY",
      title: `${flaggedCompanies.length} company(ies) flagged for expired documents`,
      body: "Review them in the verification queue.",
      href: "/admin/verification",
    });
  }

  // 3. Three-year re-verification due (US-104)
  const dueCompanies = await prisma.company.findMany({
    where: { verificationStatus: "VERIFIED", reverificationDueAt: { lt: now } },
    select: { id: true, name: true },
  });
  for (const company of dueCompanies) {
    await prisma.company.updateMany({
      where: { id: company.id, verificationStatus: "VERIFIED" },
      data: { verificationStatus: "EXPIRED_DOCUMENT" },
    });
    await notify({
      companyId: company.id,
      roles: ["COMPANY_ADMIN"],
      type: "VERIFICATION_DECISION",
      title: "Re-verification required",
      body: "Three years have passed since your last verification. Refresh your documents to restore verified status.",
      href: "/company/verification",
    });
  }

  logger.info("document-expiry job done", {
    alerts,
    expiredFlagged: flaggedCompanies.length,
    reverificationFlagged: dueCompanies.length,
  });
}
