import { Injectable } from "@nestjs/common";
import type { PaginationQuery, QuotationSubmit, RfqCreate } from "@pharmachain/core";
import { canTransitionRfq, generateRefNo, paginate, skipTake } from "@pharmachain/core";
import { Prisma, prisma } from "@pharmachain/db";
import { genericEventEmail } from "@pharmachain/email";
import { notify } from "@pharmachain/notifications";
import { badRequest, conflict, forbidden, limitReached, notFound } from "../../common/errors";
import { env } from "../../env";
import type { AuthUser, Membership } from "../../lib/context";
import { evaluateCompanyUsage } from "../billing/usage";

const SERIALIZABLE = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable } as const;

@Injectable()
export class RfqService {
  private async usageWarning(companyId: string, kind: "RFQ" | "QUOTATION"): Promise<void> {
    await notify({
      companyId,
      roles: ["COMPANY_ADMIN"],
      type: "USAGE_LIMIT_WARNING",
      title: `Approaching your monthly ${kind === "RFQ" ? "RFQ" : "quotation"} limit`,
      body: "You have used 80% of your Freemium allowance this month. Upgrade or request credits to avoid interruptions.",
      href: "/company/usage",
    });
  }

  // ─── RFQ (US-401/402/407) ──────────────────────────────────────────────────

  async createRfq(user: AuthUser, membership: Membership, input: RfqCreate) {
    if (input.categoryId) {
      const category = await prisma.category.findUnique({ where: { id: input.categoryId } });
      if (!category) throw notFound("Category not found");
    }
    if (input.bomItemId) {
      const bomItem = await prisma.bomItem.findUnique({
        where: { id: input.bomItemId },
        include: { bom: { include: { productListing: true } } },
      });
      if (!bomItem || bomItem.bom.productListing.companyId !== membership.companyId) {
        throw notFound("BOM line not found");
      }
    }

    const { rfq, usage } = await prisma.$transaction(async (tx) => {
      const usage = await evaluateCompanyUsage(
        tx,
        membership.companyId,
        membership.company.subscriptionTier,
        "RFQ",
      );
      if (usage.blocked) {
        throw limitReached("Monthly RFQ limit reached for your Freemium plan", {
          used: usage.used,
          limit: usage.limit,
          upgradePath: "/company/usage",
        });
      }
      const visibleSupplierCount = await tx.company.count({
        where: { type: input.targetCompanyType, verificationStatus: "VERIFIED" },
      });
      const rfq = await tx.rfq.create({
        data: {
          refNo: generateRefNo("RFQ"),
          buyerCompanyId: membership.companyId,
          createdById: user.id,
          title: input.title,
          specifications: input.specifications,
          quantity: input.quantity,
          unit: input.unit,
          targetCompanyType: input.targetCompanyType,
          categoryId: input.categoryId,
          deadline: new Date(input.deadline),
          bomItemId: input.bomItemId,
          visibleSupplierCount,
        },
      });
      if (input.attachmentDocumentIds.length > 0) {
        const linked = await tx.document.updateMany({
          where: {
            id: { in: input.attachmentDocumentIds },
            ownerCompanyId: membership.companyId,
            kind: "RFQ_ATTACHMENT",
            rfqId: null,
          },
          data: { rfqId: rfq.id },
        });
        if (linked.count !== input.attachmentDocumentIds.length) {
          throw badRequest("One or more attachments are invalid");
        }
      }
      return { rfq, usage };
    }, SERIALIZABLE);

    if (usage.crossesWarnThreshold) await this.usageWarning(membership.companyId, "RFQ");
    return rfq;
  }

  async listMine(membership: Membership, query: PaginationQuery) {
    const where = { buyerCompanyId: membership.companyId } as const;
    const [items, total] = await prisma.$transaction([
      prisma.rfq.findMany({
        where,
        include: {
          category: { select: { name: true } },
          _count: { select: { quotations: { where: { status: { not: "SUPERSEDED" } } } } },
        },
        orderBy: { createdAt: "desc" },
        ...skipTake(query),
      }),
      prisma.rfq.count({ where }),
    ]);
    return paginate(items, total, query);
  }

  /** Supplier inbox (US-402): open, before deadline, targeted at my company
   *  type, and — when the RFQ names a category — matching my published lines. */
  async inbox(membership: Membership, query: PaginationQuery) {
    const myCategories = await prisma.listing.findMany({
      where: { companyId: membership.companyId, status: "PUBLISHED" },
      select: { categoryId: true },
      distinct: ["categoryId"],
    });
    const categoryIds = myCategories.map((l) => l.categoryId);
    const where = {
      status: "OPEN",
      deadline: { gt: new Date() },
      targetCompanyType: membership.company.type,
      buyerCompanyId: { not: membership.companyId },
      OR: [{ categoryId: null }, { categoryId: { in: categoryIds } }],
    } satisfies Prisma.RfqWhereInput;
    const [items, total] = await prisma.$transaction([
      prisma.rfq.findMany({
        where,
        include: {
          buyerCompany: { select: { id: true, name: true, country: true } },
          category: { select: { name: true } },
          quotations: {
            where: { supplierCompanyId: membership.companyId, status: { not: "SUPERSEDED" } },
            select: { id: true, status: true, version: true },
          },
        },
        orderBy: { deadline: "asc" },
        ...skipTake(query),
      }),
      prisma.rfq.count({ where }),
    ]);
    return paginate(items, total, query);
  }

  async getRfq(user: AuthUser, membership: Membership | undefined, rfqId: string) {
    const rfq = await prisma.rfq.findUnique({
      where: { id: rfqId },
      include: {
        buyerCompany: { select: { id: true, name: true, country: true } },
        category: { select: { id: true, name: true } },
        documents: {
          where: { status: "ACTIVE", uploadCompletedAt: { not: null } },
          select: { id: true, fileName: true, size: true },
        },
        bomItem: { select: { id: true, materialName: true, bomId: true } },
        order: { select: { id: true, orderNo: true } },
      },
    });
    if (!rfq) throw notFound("RFQ not found");

    const isBuyer = membership?.companyId === rfq.buyerCompanyId;
    const isEligibleSupplier =
      membership !== undefined &&
      membership.company.type === rfq.targetCompanyType &&
      membership.company.verificationStatus === "VERIFIED";
    if (!isBuyer && !isEligibleSupplier && !user.isSuperAdmin) throw notFound("RFQ not found");

    const myQuotation =
      membership && !isBuyer
        ? await prisma.quotation.findFirst({
            where: {
              rfqId,
              supplierCompanyId: membership.companyId,
              status: { not: "SUPERSEDED" },
            },
            orderBy: { version: "desc" },
          })
        : null;

    return { ...rfq, viewerIsBuyer: isBuyer, myQuotation };
  }

  async cancelRfq(_user: AuthUser, membership: Membership, rfqId: string) {
    const rfq = await prisma.rfq.findUnique({
      where: { id: rfqId },
      include: { quotations: { where: { status: { not: "SUPERSEDED" } } } },
    });
    if (!rfq || rfq.buyerCompanyId !== membership.companyId) throw notFound("RFQ not found");
    if (!canTransitionRfq(rfq.status, "CANCELLED")) {
      throw conflict(`An RFQ in status ${rfq.status} cannot be cancelled`);
    }
    const updated = await prisma.rfq.update({
      where: { id: rfqId },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    // US-407: suppliers who responded are notified
    const supplierIds = [...new Set(rfq.quotations.map((q) => q.supplierCompanyId))];
    await Promise.all(
      supplierIds.map((companyId) =>
        notify({
          companyId,
          type: "RFQ_STATUS_CHANGE",
          title: "RFQ cancelled",
          body: `RFQ ${rfq.refNo} (${rfq.title}) was cancelled by the buyer.`,
          href: "/quotes",
          emailContent: genericEventEmail({
            title: "RFQ cancelled",
            body: `RFQ ${rfq.refNo} — ${rfq.title} — was cancelled by the buyer.`,
            url: `${env.APP_URL}/quotes`,
          }),
        }),
      ),
    );
    return updated;
  }

  // ─── Quotations (US-403/404/405/406) ───────────────────────────────────────

  private assertRfqOpenForQuoting(rfq: { status: string; deadline: Date }): void {
    if (rfq.status !== "OPEN" || rfq.deadline <= new Date()) {
      throw conflict("This RFQ is no longer accepting quotations");
    }
  }

  private async notifyBuyerOfQuotation(
    rfq: { id: string; refNo: string; title: string; buyerCompanyId: string; createdById: string },
    supplierName: string,
    updated: boolean,
  ): Promise<void> {
    await notify({
      userIds: [rfq.createdById],
      companyId: rfq.buyerCompanyId,
      roles: ["COMPANY_ADMIN", "OPERATIONS"],
      type: "NEW_QUOTATION",
      title: updated ? "Quotation updated" : "New quotation received",
      body: `${supplierName} ${updated ? "updated their quotation for" : "quoted on"} ${rfq.refNo} — ${rfq.title}.`,
      href: `/rfqs/${rfq.id}`,
      // US-406: only this supplier's action — never other suppliers' details
      emailContent: genericEventEmail({
        title: updated ? "Quotation updated" : "New quotation received",
        body: `${supplierName} ${updated ? "updated their quotation for" : "submitted a quotation for"} RFQ ${rfq.refNo} — ${rfq.title}.`,
        url: `${env.APP_URL}/rfqs/${rfq.id}`,
        cta: "Compare quotations",
      }),
      // US-604: WhatsApp for new quotations — short summary + link only, no details.
      whatsappText: `PharmaChain: ${updated ? "updated quotation" : "new quotation"} from ${supplierName} on RFQ ${rfq.refNo}. ${env.APP_URL}/rfqs/${rfq.id}`,
    });
  }

  async submitQuotation(
    user: AuthUser,
    membership: Membership,
    rfqId: string,
    input: QuotationSubmit,
  ) {
    const rfq = await prisma.rfq.findUnique({ where: { id: rfqId } });
    if (!rfq) throw notFound("RFQ not found");
    if (rfq.buyerCompanyId === membership.companyId) {
      throw forbidden("You cannot quote on your own RFQ");
    }
    if (rfq.targetCompanyType !== membership.company.type) {
      throw forbidden("This RFQ is not targeted at your company category");
    }
    this.assertRfqOpenForQuoting(rfq);

    const { quotation, usage } = await prisma.$transaction(async (tx) => {
      // Inside the serializable transaction so a concurrent submit can't slip
      // past; the partial unique index (one live quotation per rfq+supplier)
      // is the final backstop either way.
      const existing = await tx.quotation.findFirst({
        where: { rfqId, supplierCompanyId: membership.companyId, status: { not: "SUPERSEDED" } },
      });
      if (existing) {
        throw conflict("You already have a quotation on this RFQ — resubmit it instead");
      }
      const usage = await evaluateCompanyUsage(
        tx,
        membership.companyId,
        membership.company.subscriptionTier,
        "QUOTATION",
      );
      if (usage.blocked) {
        throw limitReached("Monthly quotation limit reached for your Freemium plan", {
          used: usage.used,
          limit: usage.limit,
          upgradePath: "/company/usage",
        });
      }
      const quotation = await tx.quotation.create({
        data: {
          refNo: generateRefNo("QUO"),
          rfqId,
          supplierCompanyId: membership.companyId,
          submittedById: user.id,
          unitPrice: input.unitPrice,
          currency: input.currency,
          totalPrice: new Prisma.Decimal(input.unitPrice).mul(rfq.quantity).toDP(2),
          leadTimeDays: input.leadTimeDays,
          validUntil: new Date(input.validUntil),
          notes: input.notes,
        },
      });
      if (input.attachmentDocumentIds.length > 0) {
        const linked = await tx.document.updateMany({
          where: {
            id: { in: input.attachmentDocumentIds },
            ownerCompanyId: membership.companyId,
            kind: "QUOTATION_ATTACHMENT",
            quotationId: null,
          },
          data: { quotationId: quotation.id },
        });
        if (linked.count !== input.attachmentDocumentIds.length) {
          throw badRequest("One or more attachments are invalid");
        }
      }
      return { quotation, usage };
    }, SERIALIZABLE);

    if (usage.crossesWarnThreshold) await this.usageWarning(membership.companyId, "QUOTATION");
    await this.notifyBuyerOfQuotation(rfq, membership.company.name, false);
    return quotation;
  }

  /** Resubmission before the deadline replaces (versions) the prior quotation
   *  (US-403): old row → SUPERSEDED, new row version+1, same transaction. */
  async resubmitQuotation(
    user: AuthUser,
    membership: Membership,
    quotationId: string,
    input: QuotationSubmit,
  ) {
    const current = await prisma.quotation.findUnique({
      where: { id: quotationId },
      include: { rfq: true },
    });
    if (!current || current.supplierCompanyId !== membership.companyId) {
      throw notFound("Quotation not found");
    }
    if (current.status !== "ACTIVE") {
      throw conflict(`A quotation in status ${current.status} cannot be resubmitted`);
    }
    this.assertRfqOpenForQuoting(current.rfq);

    const quotation = await prisma.$transaction(async (tx) => {
      await tx.quotation.update({
        where: { id: current.id },
        data: { status: "SUPERSEDED" },
      });
      const next = await tx.quotation.create({
        data: {
          refNo: generateRefNo("QUO"),
          rfqId: current.rfqId,
          supplierCompanyId: membership.companyId,
          submittedById: user.id,
          version: current.version + 1,
          unitPrice: input.unitPrice,
          currency: input.currency,
          totalPrice: new Prisma.Decimal(input.unitPrice).mul(current.rfq.quantity).toDP(2),
          leadTimeDays: input.leadTimeDays,
          validUntil: new Date(input.validUntil),
          notes: input.notes,
        },
      });
      if (input.attachmentDocumentIds.length > 0) {
        const linked = await tx.document.updateMany({
          where: {
            id: { in: input.attachmentDocumentIds },
            ownerCompanyId: membership.companyId,
            kind: "QUOTATION_ATTACHMENT",
            quotationId: null,
          },
          data: { quotationId: next.id },
        });
        if (linked.count !== input.attachmentDocumentIds.length) {
          throw badRequest("One or more attachments are invalid");
        }
      }
      return next;
    });

    await this.notifyBuyerOfQuotation(current.rfq, membership.company.name, true);
    return quotation;
  }

  async withdrawQuotation(membership: Membership, quotationId: string) {
    const current = await prisma.quotation.findUnique({
      where: { id: quotationId },
      include: { rfq: true },
    });
    if (!current || current.supplierCompanyId !== membership.companyId) {
      throw notFound("Quotation not found");
    }
    if (current.status !== "ACTIVE") throw conflict("Only active quotations can be withdrawn");
    const updated = await prisma.quotation.update({
      where: { id: quotationId },
      data: { status: "WITHDRAWN", withdrawnAt: new Date() },
    });
    await notify({
      userIds: [current.rfq.createdById],
      type: "NEW_QUOTATION",
      title: "Quotation withdrawn",
      body: `${membership.company.name} withdrew their quotation on ${current.rfq.refNo}.`,
      href: `/rfqs/${current.rfqId}`,
    });
    return updated;
  }

  /** Buyer comparison view (US-404): the latest version per supplier, with
   *  withdrawn/expired clearly distinguishable via status. */
  async listQuotationsForBuyer(
    membership: Membership,
    rfqId: string,
    sort: "price" | "leadTime",
    direction: "asc" | "desc",
  ) {
    const rfq = await prisma.rfq.findUnique({ where: { id: rfqId } });
    if (!rfq || rfq.buyerCompanyId !== membership.companyId) throw notFound("RFQ not found");
    return prisma.quotation.findMany({
      where: { rfqId, status: { not: "SUPERSEDED" } },
      include: {
        supplierCompany: {
          select: { id: true, name: true, country: true, subscriptionTier: true },
        },
        documents: {
          where: { status: "ACTIVE", uploadCompletedAt: { not: null } },
          select: { id: true, fileName: true },
        },
      },
      orderBy: sort === "price" ? { unitPrice: direction } : { leadTimeDays: direction },
    });
  }

  // ─── Award → order confirmation (US-405) ───────────────────────────────────

  async acceptQuotation(user: AuthUser, membership: Membership, quotationId: string) {
    const quotation = await prisma.quotation.findUnique({
      where: { id: quotationId },
      include: { rfq: true, supplierCompany: { select: { id: true, name: true } } },
    });
    if (!quotation || quotation.rfq.buyerCompanyId !== membership.companyId) {
      throw notFound("Quotation not found");
    }
    if (quotation.status !== "ACTIVE") throw conflict("Only active quotations can be accepted");
    if (quotation.validUntil <= new Date()) throw conflict("This quotation has expired");
    if (!canTransitionRfq(quotation.rfq.status, "AWARDED")) {
      throw conflict(`An RFQ in status ${quotation.rfq.status} cannot be awarded`);
    }

    const order = await prisma.$transaction(async (tx) => {
      // Conditional transition — safe under concurrent accept attempts
      const rfqUpdate = await tx.rfq.updateMany({
        where: { id: quotation.rfqId, status: { in: ["OPEN", "CLOSED"] } },
        data: { status: "AWARDED", awardedAt: new Date() },
      });
      if (rfqUpdate.count === 0) throw conflict("This RFQ was already awarded");
      await tx.quotation.update({ where: { id: quotation.id }, data: { status: "ACCEPTED" } });
      const order = await tx.order.create({
        data: {
          orderNo: generateRefNo("ORD"),
          rfqId: quotation.rfqId,
          quotationId: quotation.id,
          buyerCompanyId: quotation.rfq.buyerCompanyId,
          sellerCompanyId: quotation.supplierCompanyId,
          createdById: user.id,
          title: quotation.rfq.title,
          quantity: quotation.rfq.quantity,
          unit: quotation.rfq.unit,
          unitPrice: quotation.unitPrice,
          currency: quotation.currency,
          totalAmount: quotation.totalPrice,
        },
      });
      await tx.orderStatusEvent.create({
        data: { orderId: order.id, status: "ORDER_CONFIRMED", actorUserId: user.id },
      });
      return order;
    });

    // Winner (US-405)
    await notify({
      companyId: quotation.supplierCompanyId,
      type: "RFQ_STATUS_CHANGE",
      title: "Quotation accepted 🎉",
      body: `Your quotation ${quotation.refNo} was accepted. Order ${order.orderNo} is confirmed.`,
      href: `/orders/${order.id}`,
      emailContent: genericEventEmail({
        title: "Your quotation was accepted",
        body: `Your quotation for RFQ ${quotation.rfq.refNo} — ${quotation.rfq.title} — was accepted. Order ${order.orderNo} has been confirmed.`,
        url: `${env.APP_URL}/orders/${order.id}`,
        cta: "View order",
      }),
      whatsappText: `PharmaChain: your quotation ${quotation.refNo} was accepted — order ${order.orderNo} is confirmed.`,
    });
    // Non-selected suppliers (US-405/604): same channels as the winner — an
    // outcome they acted on deserves more than an in-app row.
    const others = await prisma.quotation.findMany({
      where: {
        rfqId: quotation.rfqId,
        status: { notIn: ["SUPERSEDED", "ACCEPTED"] },
        supplierCompanyId: { not: quotation.supplierCompanyId },
      },
      select: { supplierCompanyId: true },
      distinct: ["supplierCompanyId"],
    });
    await Promise.all(
      others.map((o) =>
        notify({
          companyId: o.supplierCompanyId,
          type: "RFQ_STATUS_CHANGE",
          title: "RFQ awarded to another supplier",
          body: `RFQ ${quotation.rfq.refNo} — ${quotation.rfq.title} — was awarded to another supplier.`,
          href: "/quotes",
          emailContent: genericEventEmail({
            title: "RFQ awarded to another supplier",
            body: `RFQ ${quotation.rfq.refNo} — ${quotation.rfq.title} — was awarded to another supplier. Thank you for quoting.`,
            url: `${env.APP_URL}/quotes`,
            cta: "Open quote inbox",
          }),
          whatsappText: `PharmaChain: RFQ ${quotation.rfq.refNo} was awarded to another supplier.`,
        }),
      ),
    );

    return order;
  }
}
