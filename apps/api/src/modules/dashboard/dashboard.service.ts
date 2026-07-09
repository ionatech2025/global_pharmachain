import { Injectable } from "@nestjs/common";
import { prisma } from "@pharmachain/db";
import type { AuthUser, Membership } from "../../lib/context";
import { getUsageSummary } from "../billing/usage";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Platform-level counts for the super-admin dashboard (US-901). */
export async function platformStats() {
  const since = new Date(Date.now() - THIRTY_DAYS_MS);
  const [
    totalCompanies,
    verifiedCompanies,
    pendingVerifications,
    totalUsers,
    openRfqs,
    ordersLast30d,
    pendingCredits,
    pendingDeletions,
  ] = await prisma.$transaction([
    prisma.company.count(),
    prisma.company.count({ where: { verificationStatus: "VERIFIED" } }),
    prisma.company.count({ where: { verificationStatus: "PENDING_VERIFICATION" } }),
    prisma.user.count(),
    prisma.rfq.count({ where: { status: "OPEN" } }),
    prisma.order.count({ where: { createdAt: { gte: since } } }),
    prisma.creditRequest.count({ where: { status: "PENDING_PAYMENT" } }),
    prisma.dataDeletionRequest.count({ where: { status: "PENDING" } }),
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
  };
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
      publishedListings,
      draftListings,
      openRfqs,
      activeQuotations,
      ordersAsBuyer,
      ordersAsSeller,
      unreadNotifications,
      expiringDocuments,
    ] = await prisma.$transaction([
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
    ]);
    const usage = await getUsageSummary(companyId, membership.company.subscriptionTier);

    return {
      scope: "company" as const,
      platform: null,
      company: {
        verificationStatus: membership.company.verificationStatus,
        publishedListings,
        draftListings,
        openRfqs,
        activeQuotations,
        ordersAsBuyer,
        ordersAsSeller,
        unreadNotifications,
        expiringDocuments,
        usage,
      },
    };
  }
}
