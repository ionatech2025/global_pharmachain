import { Injectable } from "@nestjs/common";
import type { RatingCreateInput } from "@pharmachain/core";
import { LOGISTICS_ROLE_COMPANY_TYPE, RATEABLE_ROLE_LABELS } from "@pharmachain/core";
import { prisma } from "@pharmachain/db";
import { notify } from "@pharmachain/notifications";
import { badRequest, conflict, forbidden, notFound } from "../../common/errors";
import type { AuthUser, Membership } from "../../lib/context";

/**
 * Ratings & trust system (Phase 4 §3): one rating per completed engagement,
 * verified against the shipment record — the target must actually have been
 * the seller or an appointed logistics partner on that delivered order.
 */
@Injectable()
export class RatingService {
  async rate(user: AuthUser, membership: Membership, orderId: string, input: RatingCreateInput) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { appointments: { where: { status: "ACTIVE" } } },
    });
    if (!order || order.buyerCompanyId !== membership.companyId) {
      throw notFound("Order not found");
    }
    if (!["DELIVERED", "DELIVERY_CONFIRMED"].includes(order.status)) {
      throw conflict("Ratings open once the engagement is delivered");
    }
    if (input.targetCompanyId === membership.companyId) {
      throw badRequest("You cannot rate your own company");
    }
    // Verify the target genuinely played the claimed role on this shipment.
    const validTarget =
      input.targetRole === "SELLER"
        ? order.sellerCompanyId === input.targetCompanyId
        : order.appointments.some(
            (a) =>
              a.companyId === input.targetCompanyId &&
              LOGISTICS_ROLE_COMPANY_TYPE[a.role] !== undefined &&
              a.role === input.targetRole,
          );
    if (!validTarget) {
      throw badRequest("That company did not hold this role on the engagement");
    }
    const existing = await prisma.rating.findUnique({
      where: {
        orderId_raterCompanyId_targetCompanyId: {
          orderId,
          raterCompanyId: membership.companyId,
          targetCompanyId: input.targetCompanyId,
        },
      },
    });
    if (existing) throw conflict("You already rated this company on this engagement");

    const rating = await prisma.rating.create({
      data: {
        orderId,
        raterCompanyId: membership.companyId,
        targetCompanyId: input.targetCompanyId,
        targetRole: input.targetRole,
        stars: input.stars,
        comment: input.comment,
        createdById: user.id,
      },
    });
    await notify({
      companyId: input.targetCompanyId,
      roles: ["COMPANY_ADMIN"],
      type: "ACCOUNT_UPDATE",
      title: `New ${input.stars}★ rating received`,
      body: `${membership.company.name} rated your ${RATEABLE_ROLE_LABELS[input.targetRole].toLowerCase()} performance on order ${order.orderNo}.`,
      href: `/companies/${input.targetCompanyId}`,
    });
    return rating;
  }

  /** Aggregated performance metrics + published reviews (Phase 4 §3). */
  async forCompany(companyId: string) {
    const [aggregate, byRole, ratings, company] = await Promise.all([
      prisma.rating.aggregate({
        where: { targetCompanyId: companyId, status: "PUBLISHED" },
        _avg: { stars: true },
        _count: true,
      }),
      prisma.rating.groupBy({
        by: ["targetRole"],
        where: { targetCompanyId: companyId, status: "PUBLISHED" },
        _avg: { stars: true },
        _count: true,
        orderBy: { targetRole: "asc" },
      }),
      prisma.rating.findMany({
        where: { targetCompanyId: companyId, status: "PUBLISHED" },
        include: { rater: { select: { name: true } }, order: { select: { orderNo: true } } },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.company.findUnique({
        where: { id: companyId },
        select: { trustedBadgeAt: true, featuredUntil: true },
      }),
    ]);
    return {
      average: aggregate._avg.stars,
      count: aggregate._count,
      byRole: byRole.map((r) => ({
        role: r.targetRole,
        average: r._avg?.stars ?? null,
        count: r._count,
      })),
      trustedBadgeAt: company?.trustedBadgeAt ?? null,
      featuredUntil: company?.featuredUntil ?? null,
      ratings,
    };
  }

  /** The rated company contests a review → FLAGGED for moderation. */
  async flag(membership: Membership, ratingId: string, reason: string) {
    const rating = await prisma.rating.findUnique({ where: { id: ratingId } });
    if (!rating || rating.targetCompanyId !== membership.companyId) {
      throw notFound("Rating not found");
    }
    if (rating.status !== "PUBLISHED") throw conflict("This rating is not published");
    const updated = await prisma.rating.update({
      where: { id: ratingId },
      data: { status: "FLAGGED", flaggedReason: reason },
    });
    const superAdmins = await prisma.user.findMany({
      where: { isSuperAdmin: true, status: "ACTIVE" },
      select: { id: true },
    });
    await notify({
      userIds: superAdmins.map((u) => u.id),
      type: "APPROVAL_PENDING",
      title: "Rating contested",
      body: `${membership.company.name} contested a review: ${reason}`,
      href: "/admin/ratings",
    });
    return updated;
  }

  async adminList(status?: string) {
    return prisma.rating.findMany({
      where: status ? { status: status as never } : { status: "FLAGGED" },
      include: {
        rater: { select: { id: true, name: true } },
        target: { select: { id: true, name: true } },
        order: { select: { orderNo: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
  }

  /** Moderation decision on a contested review — audited by the controller. */
  async moderate(user: AuthUser, ratingId: string, action: "RESTORE" | "REMOVE") {
    const rating = await prisma.rating.findUnique({ where: { id: ratingId } });
    if (!rating) throw notFound("Rating not found");
    const updated = await prisma.rating.update({
      where: { id: ratingId },
      data: {
        status: action === "RESTORE" ? "PUBLISHED" : "REMOVED",
        moderatedById: user.id,
      },
    });
    await notify({
      companyId: rating.targetCompanyId,
      roles: ["COMPANY_ADMIN"],
      type: "ACCOUNT_UPDATE",
      title: action === "RESTORE" ? "Contested review restored" : "Contested review removed",
      body:
        action === "RESTORE"
          ? "The platform reviewed the contested rating and restored it."
          : "The platform reviewed the contested rating and removed it.",
      href: `/companies/${rating.targetCompanyId}`,
    });
    return updated;
  }

  private forbiddenUnusedGuard() {
    // referenced to keep forbidden import for future scoped checks
    return forbidden;
  }
}
