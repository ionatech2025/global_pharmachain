import { Injectable } from "@nestjs/common";
import type { ThreadLookup } from "@pharmachain/core";
import { prisma } from "@pharmachain/db";
import { genericEventEmail } from "@pharmachain/email";
import { notify } from "@pharmachain/notifications";
import { badRequest, forbidden, notFound } from "../../common/errors";
import { env } from "../../env";
import type { AuthUser, Membership } from "../../lib/context";
import { shouldSendThreadEmail } from "./throttle";

interface ThreadParties {
  buyerCompanyId: string;
  supplierCompanyId: string;
  rfqId?: string;
  quotationId?: string;
  orderId?: string;
}

@Injectable()
export class MessagingService {
  /** Resolves the pairwise parties for a thread lookup (US-601, US-406). */
  private async resolveParties(
    membership: Membership,
    lookup: ThreadLookup,
  ): Promise<ThreadParties> {
    if (lookup.orderId) {
      const order = await prisma.order.findUnique({ where: { id: lookup.orderId } });
      if (!order) throw notFound("Order not found");
      return {
        buyerCompanyId: order.buyerCompanyId,
        supplierCompanyId: order.sellerCompanyId,
        orderId: order.id,
      };
    }
    if (lookup.quotationId) {
      const quotation = await prisma.quotation.findUnique({
        where: { id: lookup.quotationId },
        include: { rfq: true },
      });
      if (!quotation) throw notFound("Quotation not found");
      return {
        buyerCompanyId: quotation.rfq.buyerCompanyId,
        supplierCompanyId: quotation.supplierCompanyId,
        quotationId: quotation.id,
      };
    }
    if (lookup.rfqId) {
      const rfq = await prisma.rfq.findUnique({ where: { id: lookup.rfqId } });
      if (!rfq) throw notFound("RFQ not found");
      // RFQ threads are pairwise per supplier: the buyer must name the
      // supplier; a supplier is implicitly one side of their own thread.
      const isBuyer = rfq.buyerCompanyId === membership.companyId;
      const supplierCompanyId = isBuyer ? lookup.supplierCompanyId : membership.companyId;
      if (!supplierCompanyId) {
        throw badRequest("supplierCompanyId is required when opening an RFQ thread as the buyer");
      }
      return { buyerCompanyId: rfq.buyerCompanyId, supplierCompanyId, rfqId: rfq.id };
    }
    throw badRequest("Provide exactly one of rfqId, quotationId, orderId");
  }

  async lookupOrCreateThread(membership: Membership, lookup: ThreadLookup) {
    const parties = await this.resolveParties(membership, lookup);
    if (
      parties.buyerCompanyId !== membership.companyId &&
      parties.supplierCompanyId !== membership.companyId
    ) {
      throw forbidden();
    }

    const existing = await prisma.messageThread.findFirst({
      where: parties.orderId
        ? { orderId: parties.orderId }
        : parties.quotationId
          ? { quotationId: parties.quotationId }
          : { rfqId: parties.rfqId, supplierCompanyId: parties.supplierCompanyId },
    });
    if (existing) return existing;
    return prisma.messageThread.create({ data: parties });
  }

  private async loadThreadForMember(membership: Membership, threadId: string) {
    const thread = await prisma.messageThread.findUnique({
      where: { id: threadId },
      include: {
        buyerCompany: { select: { id: true, name: true } },
        supplierCompany: { select: { id: true, name: true } },
        rfq: { select: { id: true, refNo: true, title: true } },
        quotation: { select: { id: true, refNo: true } },
        order: { select: { id: true, orderNo: true, title: true } },
      },
    });
    if (
      !thread ||
      (thread.buyerCompanyId !== membership.companyId &&
        thread.supplierCompanyId !== membership.companyId)
    ) {
      throw notFound("Thread not found");
    }
    return thread;
  }

  async listThreads(membership: Membership) {
    return prisma.messageThread.findMany({
      where: {
        OR: [{ buyerCompanyId: membership.companyId }, { supplierCompanyId: membership.companyId }],
      },
      include: {
        buyerCompany: { select: { id: true, name: true } },
        supplierCompany: { select: { id: true, name: true } },
        rfq: { select: { id: true, refNo: true, title: true } },
        quotation: { select: { id: true, refNo: true } },
        order: { select: { id: true, orderNo: true, title: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { body: true, createdAt: true },
        },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
    });
  }

  async listMessages(membership: Membership, threadId: string, after?: string) {
    const thread = await this.loadThreadForMember(membership, threadId);
    const messages = await prisma.message.findMany({
      where: {
        threadId,
        ...(after ? { createdAt: { gt: new Date(after) } } : {}),
      },
      include: {
        sender: { select: { id: true, name: true } },
        attachments: {
          where: { status: "ACTIVE", uploadCompletedAt: { not: null } },
          select: { id: true, fileName: true, size: true },
        },
      },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    return { thread, messages };
  }

  async postMessage(
    user: AuthUser,
    membership: Membership,
    threadId: string,
    body: string,
    attachmentDocumentIds: string[],
  ) {
    const thread = await this.loadThreadForMember(membership, threadId);
    const now = new Date();
    const sendEmail = shouldSendThreadEmail(thread.lastEmailNotifiedAt, now);

    const message = await prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          threadId,
          senderId: user.id,
          senderCompanyId: membership.companyId,
          senderRole: membership.role,
          body,
        },
      });
      if (attachmentDocumentIds.length > 0) {
        const linked = await tx.document.updateMany({
          where: {
            id: { in: attachmentDocumentIds },
            ownerCompanyId: membership.companyId,
            kind: "MESSAGE_ATTACHMENT",
            messageId: null,
          },
          data: { messageId: message.id },
        });
        if (linked.count !== attachmentDocumentIds.length) {
          throw badRequest("One or more attachments are invalid");
        }
      }
      await tx.messageThread.update({
        where: { id: threadId },
        data: { updatedAt: now, ...(sendEmail ? { lastEmailNotifiedAt: now } : {}) },
      });
      return message;
    });

    const otherCompanyId =
      thread.buyerCompanyId === membership.companyId
        ? thread.supplierCompanyId
        : thread.buyerCompanyId;
    const context =
      thread.order?.orderNo ?? thread.quotation?.refNo ?? thread.rfq?.refNo ?? "conversation";
    const excerpt = body.length > 140 ? `${body.slice(0, 140)}…` : body;

    await notify({
      companyId: otherCompanyId,
      type: "NEW_MESSAGE",
      title: `New message on ${context}`,
      body: `${user.name} (${membership.company.name}): ${excerpt}`,
      href: `/messages/${threadId}`,
      // Skip-throttle: in-app always lands; email at most once per 10 minutes.
      emailContent: sendEmail
        ? genericEventEmail({
            title: `New message on ${context}`,
            body: `${user.name} (${membership.company.name}) wrote:\n"${excerpt}"`,
            url: `${env.APP_URL}/messages/${threadId}`,
            cta: "Reply",
          })
        : undefined,
      whatsappText: sendEmail
        ? `PharmaChain: new message on ${context} from ${membership.company.name}. ${env.APP_URL}/messages/${threadId}`
        : undefined,
    });

    return message;
  }
}
