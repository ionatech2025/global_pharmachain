import { DOCUMENT_KIND_LABELS, EXPIRY_ENFORCED_KINDS, PARAM_KEYS } from "@pharmachain/core";
import { prisma } from "@pharmachain/db";
import { genericEventEmail } from "@pharmachain/email";
import { notify } from "@pharmachain/notifications";
import { env } from "../env";
import { daysUntil, shouldAlertExpiry } from "../lib/expiry";
import { logger } from "../lib/logger";
import { getCsvIntParam } from "../lib/params";
import { requeueIfRenewed } from "../modules/company/renewal";
import { findLapsedDocuments } from "../modules/company/verification-checklist";

/**
 * Daily expiry sweep (US-104):
 *  1. Alert companies at configured thresholds before a document expires.
 *  2. Flag VERIFIED companies whose compliance documents have expired.
 *  3. Flag companies whose 3-year re-verification is due.
 *  4. Return companies whose renewal is in to the queue for re-approval.
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

  // 2. Expired documents → EXPIRED_DOCUMENT flag on verified companies. Any
  //    lapsed copy makes a company a candidate; only the current copy of each
  //    kind decides, as on the checklist.
  const candidates = await prisma.document.findMany({
    where: {
      status: "ACTIVE",
      uploadCompletedAt: { not: null },
      expiresAt: { lt: now },
      ownerCompany: { verificationStatus: "VERIFIED" },
      kind: { in: [...EXPIRY_ENFORCED_KINDS] },
    },
    select: { ownerCompanyId: true },
    distinct: ["ownerCompanyId"],
  });
  const flagged: Array<{ id: string; name: string; what: string }> = [];
  for (const { ownerCompanyId: companyId } of candidates) {
    const lapsed = await findLapsedDocuments(companyId, now);
    if (lapsed.length === 0) continue;
    const moved = await prisma.company.updateMany({
      where: { id: companyId, verificationStatus: "VERIFIED" },
      data: { verificationStatus: "EXPIRED_DOCUMENT" },
    });
    if (moved.count === 0) continue;
    const { name } = await prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { name: true },
    });
    const what = lapsed
      .map((d) => `${DOCUMENT_KIND_LABELS[d.kind]} (expired ${d.expiresAt?.toDateString()})`)
      .join(", ");
    flagged.push({ id: companyId, name, what });
    // The expiry itself is the alert that matters most, and it was in-app only:
    // a document set to lapse before the next 60/30/7-day reminder could come
    // round reached nobody's inbox at all (client review, 2026-10-27).
    await notify({
      companyId,
      roles: ["COMPANY_ADMIN"],
      type: "DOCUMENT_EXPIRY",
      title: "A compliance document has expired",
      body: `${what}. Your company is flagged until a renewal is uploaded and re-approved.`,
      href: "/company/verification",
      emailContent: genericEventEmail({
        title: "A compliance document has expired",
        body: `${name}: ${what}. Marketplace actions are paused until you upload a renewal and the platform team re-approves your company.`,
        url: `${env.APP_URL}/company/verification`,
        cta: "Upload a renewal",
      }),
    });
  }
  if (flagged.length > 0) {
    const superAdmins = await prisma.user.findMany({
      where: { isSuperAdmin: true, status: "ACTIVE" },
      select: { id: true },
    });
    // One per company, named and linked: a single "N company(ies) flagged" line
    // said nothing an admin could act on, and a day of digests buried it.
    for (const company of flagged) {
      await notify({
        userIds: superAdmins.map((u) => u.id),
        type: "DOCUMENT_EXPIRY",
        title: `${company.name}: compliance document expired`,
        body: `${company.what}. The company is flagged until it uploads a renewal and you re-approve it.`,
        href: `/admin/companies/${company.id}`,
        emailContent: genericEventEmail({
          title: `${company.name}: compliance document expired`,
          body: `${company.what}. The company has been flagged EXPIRED_DOCUMENT and loses marketplace access until it uploads a renewal and is re-approved.`,
          url: `${env.APP_URL}/admin/companies/${company.id}`,
          cta: "Open the company",
        }),
      });
    }
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

  // 4. Renewals already in: a flagged company that has since replaced what
  //    lapsed goes back to the queue as "Awaiting re-approval". Completing the
  //    upload does this itself; the sweep catches renewals made before it did,
  //    and any upload whose follow-up did not run. Three-year re-verification
  //    flags are left alone — they wait for the company to refresh its documents.
  const flaggedForExpiry = await prisma.company.findMany({
    where: {
      verificationStatus: "EXPIRED_DOCUMENT",
      OR: [{ reverificationDueAt: null }, { reverificationDueAt: { gt: now } }],
    },
    select: { id: true },
  });
  let requeued = 0;
  for (const { id } of flaggedForExpiry) {
    if (await requeueIfRenewed(id, now)) requeued++;
  }

  logger.info("document-expiry job done", {
    alerts,
    expiredFlagged: flagged.length,
    reverificationFlagged: dueCompanies.length,
    renewalsRequeued: requeued,
  });
}
