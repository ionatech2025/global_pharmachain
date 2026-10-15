import { Injectable } from "@nestjs/common";
import { prisma } from "@pharmachain/db";
import { jobNames } from "../../jobs/registry";
import type { AuthUser, Membership } from "../../lib/context";
import { getUsageSummary } from "../billing/usage";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Platform-level counts for the super-admin dashboard (US-901). */
export async function platformStats() {
  const since = new Date(Date.now() - THIRTY_DAYS_MS);
  const [
    [
      totalCompanies,
      verifiedCompanies,
      pendingVerifications,
      totalUsers,
      openRfqs,
      ordersLast30d,
      pendingCredits,
      pendingDeletions,
    ],
    openIssues,
    jobsAttention,
  ] = await Promise.all([
    prisma.$transaction([
      prisma.company.count(),
      prisma.company.count({ where: { verificationStatus: "VERIFIED" } }),
      prisma.company.count({ where: { verificationStatus: "PENDING_VERIFICATION" } }),
      prisma.user.count(),
      prisma.rfq.count({ where: { status: "OPEN" } }),
      prisma.order.count({ where: { createdAt: { gte: since } } }),
      prisma.creditRequest.count({ where: { status: "PENDING_PAYMENT" } }),
      prisma.dataDeletionRequest.count({ where: { status: "PENDING" } }),
    ]),
    prisma.supportIssue
      .count({ where: { status: { in: ["OPEN", "IN_PROGRESS"] } } })
      .catch(() => 0),
    jobsNeedingAttention(),
  ]);
  return {
    totalCompanies,
    verifiedCompanies,
    pendingVerifications,
    totalUsers,
    openRfqs,
    ordersLast30d,
    pendingCredits,
    pendingDeletions,
    openIssues,
    jobsNeedingAttention: jobsAttention,
  };
}

/**
 * Scheduled jobs that are failing, or have not succeeded within their tier's
 * window. Production has no resident clock — an external scheduler calls the
 * dispatcher — so when that stops (GitHub disables cron in an idle public
 * repository after 60 days) nothing fails loudly: RFQs just stop closing.
 * Counting it here puts it in front of the platform team on every visit.
 */
async function jobsNeedingAttention(now = Date.now()): Promise<number> {
  const frequent = new Set(jobNames("frequent"));
  const beats = await prisma.jobHeartbeat.findMany({
    select: { name: true, lastOkAt: true, lastError: true },
  });
  const seen = new Set(beats.map((b) => b.name));
  const neverRan = jobNames().filter((name) => !seen.has(name)).length;
  const unhealthy = beats.filter((b) => {
    const windowMs = frequent.has(b.name) ? 60 * 60_000 : 26 * 60 * 60_000;
    return b.lastError !== null || !b.lastOkAt || now - b.lastOkAt.getTime() > windowMs;
  }).length;
  return neverRan + unhealthy;
}

@Injectable()
export class DashboardService {
  async summary(user: AuthUser, membership: Membership | undefined) {
    if (!membership) {
      // Super admin (or company-less account): platform view
      return { scope: "platform" as const, platform: await platformStats(), company: null };
    }

    const companyId = membership.companyId;
    const soon = new Date(Date.now() + THIRTY_DAYS_MS);
    const [
      [
        publishedListings,
        draftListings,
        openRfqs,
        activeQuotations,
        ordersAsBuyer,
        ordersAsSeller,
        unreadNotifications,
        expiringDocuments,
      ],
      usage,
      openIssues,
    ] = await Promise.all([
      prisma.$transaction([
        prisma.listing.count({ where: { companyId, status: "PUBLISHED" } }),
        prisma.listing.count({ where: { companyId, status: "DRAFT" } }),
        prisma.rfq.count({ where: { buyerCompanyId: companyId, status: "OPEN" } }),
        prisma.quotation.count({ where: { supplierCompanyId: companyId, status: "ACTIVE" } }),
        prisma.order.count({ where: { buyerCompanyId: companyId, status: { not: "DELIVERED" } } }),
        prisma.order.count({ where: { sellerCompanyId: companyId, status: { not: "DELIVERED" } } }),
        prisma.notification.count({ where: { userId: user.id, readAt: null } }),
        prisma.document.count({
          where: {
            ownerCompanyId: companyId,
            status: "ACTIVE",
            expiresAt: { gte: new Date(), lte: soon },
          },
        }),
      ]),
      getUsageSummary(companyId, membership.company.subscriptionTier),
      prisma.supportIssue
        .count({ where: { companyId, status: { in: ["OPEN", "IN_PROGRESS"] } } })
        .catch(() => 0),
    ]);

    return {
      scope: "company" as const,
      platform: null,
      company: {
        verificationStatus: membership.company.verificationStatus,
        profilePublished: membership.company.profileStatus === "PUBLISHED",
        publishedListings,
        draftListings,
        openRfqs,
        activeQuotations,
        ordersAsBuyer,
        ordersAsSeller,
        unreadNotifications,
        expiringDocuments,
        openIssues,
        usage,
      },
    };
  }
}
