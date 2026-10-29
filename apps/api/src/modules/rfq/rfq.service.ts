import { Injectable } from "@nestjs/common";
import type {
  CompanyType,
  PaginationQuery,
  QuotationSubmit,
  RfqAmend,
  RfqCreate,
} from "@pharmachain/core";
import {
  canTransitionRfq,
  effectiveRfqStatus,
  formatNoticeTime,
  generateRefNo,
  paginate,
  RFQ_STATUSES,
  type RfqStatus,
  skipTake,
} from "@pharmachain/core";
import { Prisma, prisma } from "@pharmachain/db";
import { genericEventEmail } from "@pharmachain/email";
import { notify } from "@pharmachain/notifications";
import { badRequest, conflict, forbidden, limitReached, notFound } from "../../common/errors";
import { env } from "../../env";
import type { AuthUser, Membership } from "../../lib/context";
import { defer } from "../../lib/defer";
import { withSerializableRetry } from "../../lib/tx";
import { emitWebhookEvent } from "../../lib/webhooks";
import { evaluateCompanyUsage } from "../billing/usage";
import { distributeRfq, rfqAudience } from "./distribution";

const SERIALIZABLE = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable } as const;

/**
 * Who would actually see an RFQ — the supplier inbox's rule exactly: verified,
 * of the target type, not the buyer itself, and, when the RFQ names a
 * category, with a published listing in it. A category narrows reach; with
 * few suppliers listing most categories it can narrow it to nobody, so the
 * buyer is shown both numbers before publishing.
 */
export async function rfqReach(
  db: Prisma.TransactionClient,
  buyerCompanyId: string,
  targetCompanyType: CompanyType,
  categoryId?: string,
): Promise<{ ofType: number; inCategory: number | null }> {
  const base = {
    type: targetCompanyType,
    verificationStatus: "VERIFIED",
    id: { not: buyerCompanyId },
  } satisfies Prisma.CompanyWhereInput;
  const [ofType, inCategory] = await Promise.all([
    db.company.count({ where: base }),
    categoryId
      ? db.company.count({
          where: { ...base, listings: { some: { status: "PUBLISHED", categoryId } } },
        })
      : Promise.resolve(null),
  ]);
  return { ofType, inCategory };
}

/** Status as a reader should act on it — see effectiveRfqStatus. */
function withEffectiveStatus<T extends { status: RfqStatus; deadline: Date }>(rfq: T): T {
  return { ...rfq, status: effectiveRfqStatus(rfq.status, rfq.deadline) };
}

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

    const { rfq, usage } = await withSerializableRetry(() =>
      prisma.$transaction(async (tx) => {
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
        // The count the buyer is told ("visible to N suppliers") follows the
        // inbox rule, category included — it used to count the whole type.
        const reach = await rfqReach(
          tx,
          membership.companyId,
          input.targetCompanyType,
          input.categoryId,
        );
        const visibleSupplierCount = reach.inCategory ?? reach.ofType;
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
      }, SERIALIZABLE),
    );

    if (usage.crossesWarnThreshold) await this.usageWarning(membership.companyId, "RFQ");
    // Delivered to every eligible supplier straight after the response; the
    // rfq-distribution job finishes anything this attempt could not.
    defer(distributeRfq(rfq.id));
    return rfq;
  }

  /** Reach of an RFQ before it is published — see rfqReach. */
  reach(membership: Membership, targetCompanyType: CompanyType, categoryId?: string) {
    return rfqReach(prisma, membership.companyId, targetCompanyType, categoryId);
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
    return paginate(items.map(withEffectiveStatus), total, query);
  }

  /**
   * Supplier inbox (US-402): RFQs this company can still quote on — open, before
   * the deadline, targeted at its company type and, when an RFQ names a
   * category, matching one of its published listing categories.
   *
   * "Still": an RFQ it has already quoted on lives under Quotations sent, where
   * it is resubmitted or withdrawn. It used to stay here too, so the same
   * quotation could be replaced from both tabs (client review, 2026-10-29).
   *
   * The response also states the rule it applied (`scope`): which categories
   * this company is matched on. An RFQ naming another category reaches only the
   * suppliers listing it, and nothing used to tell a supplier why an RFQ for its
   * company type never appeared (the same review).
   */
  async inbox(membership: Membership, query: PaginationQuery) {
    const myCategories = await prisma.listing.findMany({
      where: { companyId: membership.companyId, status: "PUBLISHED" },
      select: { category: { select: { id: true, name: true } } },
      distinct: ["categoryId"],
    });
    const categories = myCategories
      .map((l) => l.category)
      .sort((a, b) => a.name.localeCompare(b.name));
    const where = {
      status: "OPEN",
      deadline: { gt: new Date() },
      targetCompanyType: membership.company.type,
      buyerCompanyId: { not: membership.companyId },
      OR: [{ categoryId: null }, { categoryId: { in: categories.map((c) => c.id) } }],
      // Any quotation it still has here (active, withdrawn, expired, accepted)
      // is one it cannot submit afresh — that RFQ is under Quotations sent.
      quotations: {
        none: { supplierCompanyId: membership.companyId, status: { not: "SUPERSEDED" } },
      },
    } satisfies Prisma.RfqWhereInput;
    const [items, total] = await prisma.$transaction([
      prisma.rfq.findMany({
        where,
        include: {
          buyerCompany: { select: { id: true, name: true, country: true } },
          category: { select: { name: true } },
        },
        orderBy: { deadline: "asc" },
        ...skipTake(query),
      }),
      prisma.rfq.count({ where }),
    ]);
    return {
      ...paginate(items, total, query),
      scope: { companyType: membership.company.type, categories },
    };
  }

  /**
   * Quotations this company has sent, newest first — the other half of the
   * quoting workspace. The Quote inbox answers "what can I quote on?"; this
   * answers "what did I quote, and where did it land?", which is what the
   * dashboard's "Active quotations" count is actually counting.
   */
  async myQuotations(membership: Membership, query: PaginationQuery) {
    const where = {
      supplierCompanyId: membership.companyId,
      status: { not: "SUPERSEDED" },
    } satisfies Prisma.QuotationWhereInput;
    const [items, total] = await prisma.$transaction([
      prisma.quotation.findMany({
        where,
        include: {
          rfq: {
            select: {
              id: true,
              refNo: true,
              title: true,
              deadline: true,
              status: true,
              buyerCompany: { select: { id: true, name: true, country: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
        ...skipTake(query),
      }),
      prisma.quotation.count({ where }),
    ]);
    return paginate(
      items.map((q) => ({ ...q, rfq: withEffectiveStatus(q.rfq) })),
      total,
      query,
    );
  }

  private async isEligibleSupplierForRfq(
    membership: Membership | undefined,
    rfq: { targetCompanyType: CompanyType; categoryId: string | null },
  ): Promise<boolean> {
    if (
      !membership ||
      membership.company.type !== rfq.targetCompanyType ||
      membership.company.verificationStatus !== "VERIFIED"
    ) {
      return false;
    }
    if (!rfq.categoryId) return true;
    const match = await prisma.listing.findFirst({
      where: {
        companyId: membership.companyId,
        status: "PUBLISHED",
        categoryId: rfq.categoryId,
      },
      select: { id: true },
    });
    return match !== null;
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
        amendments: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            note: true,
            previousDeadline: true,
            newDeadline: true,
            createdAt: true,
          },
        },
      },
    });
    if (!rfq) throw notFound("RFQ not found");

    const isBuyer = membership?.companyId === rfq.buyerCompanyId;
    // A supplier the RFQ was delivered to keeps access even if it stops matching
    // later (a listing unpublished): it was given the solicitation, and its
    // addenda and outcome are still its business.
    const isRecipient =
      !isBuyer &&
      membership !== undefined &&
      (await prisma.rfqDistribution.findUnique({
        where: { rfqId_companyId: { rfqId, companyId: membership.companyId } },
        select: { id: true },
      })) !== null;
    const isEligibleSupplier =
      !isBuyer && (isRecipient || (await this.isEligibleSupplierForRfq(membership, rfq)));
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

    return { ...withEffectiveStatus(rfq), viewerIsBuyer: isBuyer, myQuotation };
  }

  async cancelRfq(_user: AuthUser, membership: Membership, rfqId: string) {
    const rfq = await prisma.rfq.findUnique({ where: { id: rfqId } });
    if (!rfq || rfq.buyerCompanyId !== membership.companyId) throw notFound("RFQ not found");
    const from = RFQ_STATUSES.filter((st) => canTransitionRfq(st, "CANCELLED"));
    if (!from.includes(rfq.status)) {
      throw conflict(`An RFQ in status ${rfq.status} cannot be cancelled`);
    }
    // Conditional, like the award: a cancel racing an award (two tabs, two
    // colleagues) used to overwrite AWARDED with CANCELLED while the order stood.
    const moved = await prisma.rfq.updateMany({
      where: { id: rfqId, status: { in: from } },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    if (moved.count === 0)
      throw conflict("This RFQ was just awarded or closed — it was not cancelled");
    const updated = await prisma.rfq.findUniqueOrThrow({ where: { id: rfqId } });
    // US-407 / UNCITRAL art. 30(4): every supplier the RFQ was provided to is
    // told — not only those that had already quoted (some were still preparing).
    const audience = await rfqAudience(rfqId);
    const url = `${env.APP_URL}/rfqs/${rfq.id}`;
    await Promise.all(
      audience.map((companyId) =>
        notify({
          companyId,
          roles: ["COMPANY_ADMIN", "OPERATIONS"],
          type: "RFQ_STATUS_CHANGE",
          title: "RFQ cancelled",
          body: `RFQ ${rfq.refNo} (${rfq.title}) was cancelled by the buyer. No quotation is needed.`,
          href: `/rfqs/${rfq.id}`,
          emailContent: genericEventEmail({
            title: "RFQ cancelled",
            body: `RFQ ${rfq.refNo} — ${rfq.title} — was cancelled by the buyer. No quotation is needed.`,
            url,
          }),
          whatsappText: `PharmaChain: RFQ ${rfq.refNo} was cancelled by the buyer.`,
        }),
      ),
    );
    defer(
      emitWebhookEvent(audience, "rfq.cancelled", {
        rfqId: rfq.id,
        refNo: rfq.refNo,
        title: rfq.title,
        cancelledAt: updated.cancelledAt?.toISOString(),
      }),
    );
    return updated;
  }

  /**
   * An addendum to an open RFQ, optionally with a later deadline (UNCITRAL Model
   * Law arts. 28(2), 30(2)-(4)): dated, kept, and sent promptly to every supplier
   * the RFQ reached. A deadline only moves later — shortening it would take time
   * from suppliers already preparing a response.
   */
  async amendRfq(user: AuthUser, membership: Membership, rfqId: string, input: RfqAmend) {
    const rfq = await prisma.rfq.findUnique({ where: { id: rfqId } });
    if (!rfq || rfq.buyerCompanyId !== membership.companyId) throw notFound("RFQ not found");
    if (effectiveRfqStatus(rfq.status, rfq.deadline) !== "OPEN") {
      throw conflict("Only an open RFQ can be amended, before its deadline");
    }
    const newDeadline = input.newDeadline ? new Date(input.newDeadline) : rfq.deadline;
    if (newDeadline.getTime() < rfq.deadline.getTime()) {
      throw badRequest("A deadline can be extended, not brought forward");
    }
    const amendment = await prisma.$transaction(async (tx) => {
      // Compare-and-set on the deadline read above, so two amendments in flight
      // cannot silently overwrite each other's extension.
      const moved = await tx.rfq.updateMany({
        where: { id: rfqId, status: "OPEN", deadline: { equals: rfq.deadline, gt: new Date() } },
        data: { deadline: newDeadline },
      });
      if (moved.count === 0) {
        throw conflict("The RFQ changed while you were amending it — reload and try again");
      }
      return tx.rfqAmendment.create({
        data: {
          rfqId,
          createdById: user.id,
          note: input.note,
          previousDeadline: rfq.deadline,
          newDeadline,
        },
      });
    });

    const extended = newDeadline.getTime() !== rfq.deadline.getTime();
    const closes = formatNoticeTime(newDeadline);
    const headline = extended
      ? `RFQ ${rfq.refNo} amended — the deadline is now ${closes}.`
      : `RFQ ${rfq.refNo} amended. The deadline is unchanged: ${closes}.`;
    const url = `${env.APP_URL}/rfqs/${rfq.id}`;
    const audience = await rfqAudience(rfqId);
    await Promise.all(
      audience.map((companyId) =>
        notify({
          companyId,
          roles: ["COMPANY_ADMIN", "OPERATIONS"],
          type: "RFQ_STATUS_CHANGE",
          title: extended ? "RFQ amended, deadline extended" : "RFQ amended",
          body: `${headline} ${input.note}`,
          href: `/rfqs/${rfq.id}`,
          emailContent: genericEventEmail({
            title: extended ? "RFQ amended — deadline extended" : "RFQ amended",
            body: `${headline}\n\n${rfq.title}\n\n${input.note}\n\nThe amendment is part of the RFQ. If you have already quoted, your quotation stands; you can replace it before the deadline.`,
            url,
            cta: "Review the amendment",
          }),
          whatsappText: `PharmaChain: ${headline} ${url}`,
        }),
      ),
    );
    defer(
      emitWebhookEvent(audience, "rfq.amended", {
        rfqId: rfq.id,
        refNo: rfq.refNo,
        amendmentId: amendment.id,
        note: input.note,
        previousDeadline: rfq.deadline.toISOString(),
        deadline: newDeadline.toISOString(),
      }),
    );
    return { amendment, recipients: audience.length };
  }

  // ─── Live change feeds (SSE) ────────────────────────────────────────────────

  /**
   * What an RFQ page shows, reduced to a string that changes when it does: the
   * RFQ itself (status, deadline, amendments all bump updatedAt), its effective
   * status (the deadline passing is a change even before the close job runs),
   * and quotations — every one for the buyer, only its own for a supplier, so
   * the feed never reveals that competitors quoted (US-406).
   */
  async rfqFingerprint(rfqId: string, viewer: { companyId: string | null; isBuyer: boolean }) {
    // A viewer with no company (a platform admin) follows the RFQ itself only:
    // there is no "own quotation" to watch, and an empty id is not a uuid.
    const quoteScope = viewer.isBuyer
      ? { rfqId }
      : viewer.companyId
        ? { rfqId, supplierCompanyId: viewer.companyId }
        : null;
    const [rfq, quotes] = await Promise.all([
      prisma.rfq.findUnique({
        where: { id: rfqId },
        select: { updatedAt: true, status: true, deadline: true },
      }),
      quoteScope
        ? prisma.quotation.aggregate({
            where: quoteScope,
            _count: { _all: true },
            _max: { updatedAt: true },
          })
        : Promise.resolve({ _count: { _all: 0 }, _max: { updatedAt: null } }),
    ]);
    if (!rfq) return "gone";
    return [
      rfq.updatedAt.toISOString(),
      effectiveRfqStatus(rfq.status, rfq.deadline),
      quotes._count._all,
      quotes._max.updatedAt?.toISOString() ?? "",
    ].join("|");
  }

  /** The supplier inbox, reduced the same way: a new RFQ for this company, any
   *  change to one, or one passing its deadline. */
  async inboxFingerprintFor(membership: Membership): Promise<() => Promise<string>> {
    const myCategories = await prisma.listing.findMany({
      where: { companyId: membership.companyId, status: "PUBLISHED" },
      select: { categoryId: true },
      distinct: ["categoryId"],
    });
    const where = {
      targetCompanyType: membership.company.type,
      buyerCompanyId: { not: membership.companyId },
      OR: [{ categoryId: null }, { categoryId: { in: myCategories.map((l) => l.categoryId) } }],
    } satisfies Prisma.RfqWhereInput;
    return async () => {
      const [all, open] = await Promise.all([
        prisma.rfq.aggregate({ where, _count: { _all: true }, _max: { updatedAt: true } }),
        prisma.rfq.count({ where: { ...where, status: "OPEN", deadline: { gt: new Date() } } }),
      ]);
      return `${all._count._all}|${all._max.updatedAt?.toISOString() ?? ""}|${open}`;
    };
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

  /**
   * The supplier's receipt (UNCITRAL Model Law art. 30(5)(c)): the date and time
   * the quotation was received, its reference and version, and until when it can
   * still be replaced. Not opt-out-able — it is their record of submission.
   */
  private async sendQuotationReceipt(
    user: AuthUser,
    quotation: {
      id: string;
      refNo: string;
      version: number;
      currency: string;
      totalPrice: Prisma.Decimal;
      createdAt: Date;
    },
    rfq: { id: string; refNo: string; title: string; deadline: Date; buyerCompanyId: string },
  ): Promise<void> {
    const receivedAt = formatNoticeTime(quotation.createdAt);
    const body = `Quotation ${quotation.refNo} (version ${quotation.version}, ${quotation.currency} ${quotation.totalPrice.toString()} total) for RFQ ${rfq.refNo} — ${rfq.title} — was received ${receivedAt}. You can replace it until ${formatNoticeTime(rfq.deadline)}.`;
    await notify({
      userIds: [user.id],
      type: "QUOTATION_RECEIPT",
      title: `Quotation ${quotation.refNo} received`,
      body,
      href: `/rfqs/${rfq.id}`,
      emailContent: genericEventEmail({
        title: "Quotation received",
        body,
        url: `${env.APP_URL}/rfqs/${rfq.id}`,
        cta: "View the RFQ",
      }),
    });
    defer(
      emitWebhookEvent([rfq.buyerCompanyId], "quotation.received", {
        rfqId: rfq.id,
        rfqRefNo: rfq.refNo,
        quotationId: quotation.id,
        quotationRefNo: quotation.refNo,
        version: quotation.version,
        receivedAt: quotation.createdAt.toISOString(),
      }),
    );
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
    if (!(await this.isEligibleSupplierForRfq(membership, rfq))) {
      throw forbidden("This RFQ requires a published listing in its material category");
    }
    this.assertRfqOpenForQuoting(rfq);

    const { quotation, usage } = await withSerializableRetry(() =>
      prisma.$transaction(async (tx) => {
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
      }, SERIALIZABLE),
    );

    if (usage.crossesWarnThreshold) await this.usageWarning(membership.companyId, "QUOTATION");
    await this.notifyBuyerOfQuotation(rfq, membership.company.name, false);
    await this.sendQuotationReceipt(user, quotation, rfq);
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
    await this.sendQuotationReceipt(user, quotation, current.rfq);
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
      include: {
        rfq: true,
        supplierCompany: { select: { id: true, name: true, verificationStatus: true } },
      },
    });
    if (!quotation || quotation.rfq.buyerCompanyId !== membership.companyId) {
      throw notFound("Quotation not found");
    }
    if (quotation.status !== "ACTIVE") throw conflict("Only active quotations can be accepted");
    // A quotation outlives the standing of the company that wrote it. Quoting
    // already requires VERIFIED; so must being awarded, or a supplier that was
    // suspended (or whose licence lapsed) after quoting could still be handed an
    // order.
    if (quotation.supplierCompany.verificationStatus !== "VERIFIED") {
      throw conflict(
        "This supplier is not currently verified on the platform, so its quotation cannot be accepted",
      );
    }
    if (quotation.validUntil <= new Date()) throw conflict("This quotation has expired");
    if (!canTransitionRfq(quotation.rfq.status, "AWARDED")) {
      throw conflict(`An RFQ in status ${quotation.rfq.status} cannot be awarded`);
    }

    // Phase 2 §2: detect hazard-classified goods (GHS on the seller's
    // matching catalogue listings) and phyto-relevant categories at order
    // creation — they drive the DGD / Phytosanitary Certificate prompts on
    // the shipment document checklist.
    const matchingListings = await prisma.listing.findMany({
      where: {
        companyId: quotation.supplierCompanyId,
        status: { not: "DEACTIVATED" },
        ...(quotation.rfq.categoryId ? { categoryId: quotation.rfq.categoryId } : {}),
      },
      select: {
        ghsClassification: true,
        category: { select: { slug: true, name: true } },
      },
      take: 25,
    });
    const dangerousGoods = matchingListings.some(
      (l) => l.ghsClassification && l.ghsClassification.trim().length > 0,
    );
    const PHYTO_PATTERN = /herbal|botanic|plant|phyto/i;
    const phytoRequired =
      PHYTO_PATTERN.test(quotation.rfq.title) ||
      matchingListings.some(
        (l) =>
          PHYTO_PATTERN.test(l.category?.slug ?? "") || PHYTO_PATTERN.test(l.category?.name ?? ""),
      );

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
          dangerousGoods,
          phytoRequired,
        },
      });
      await tx.orderStatusEvent.create({
        data: { orderId: order.id, status: "ORDER_CONFIRMED", actorUserId: user.id },
      });
      return order;
    });

    // Phase 5 §3: signed webhook push to both parties' external systems.
    defer(
      emitWebhookEvent(
        [quotation.rfq.buyerCompanyId, quotation.supplierCompanyId],
        "order.created",
        { orderId: order.id, orderNo: order.orderNo, title: order.title },
      ),
    );
    // Winner (US-405)
    await notify({
      companyId: quotation.supplierCompanyId,
      type: "RFQ_STATUS_CHANGE",
      title: "Quotation accepted",
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
