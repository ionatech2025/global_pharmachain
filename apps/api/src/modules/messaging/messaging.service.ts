import { Injectable, type MessageEvent } from "@nestjs/common";
import type { ThreadLookup } from "@pharmachain/core";
import { prisma } from "@pharmachain/db";
import { genericEventEmail } from "@pharmachain/email";
import { notify } from "@pharmachain/notifications";
import { Observable } from "rxjs";
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
    const isPairwiseParty =
      parties.buyerCompanyId === membership.companyId ||
      parties.supplierCompanyId === membership.companyId;
    // Appointed logistics companies may open the order thread (Phase 2 §2).
    const isAppointed =
      !isPairwiseParty &&
      parties.orderId !== undefined &&
      (await prisma.shipmentAppointment.findFirst({
        where: { orderId: parties.orderId, companyId: membership.companyId, status: "ACTIVE" },
        select: { id: true },
      })) !== null;
    if (!isPairwiseParty && !isAppointed) {
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
    if (!thread) throw notFound("Thread not found");
    const isPairwiseParty =
      thread.buyerCompanyId === membership.companyId ||
      thread.supplierCompanyId === membership.companyId;
    // Phase 2 §2: appointed logistics companies join the ORDER thread so
    // clearing agents/forwarders can message buyers in shipment context.
    const isAppointed =
      !isPairwiseParty &&
      thread.orderId !== null &&
      (await prisma.shipmentAppointment.findFirst({
        where: { orderId: thread.orderId, companyId: membership.companyId, status: "ACTIVE" },
        select: { id: true },
      })) !== null;
    if (!isPairwiseParty && !isAppointed) {
      throw notFound("Thread not found");
    }
    return thread;
  }

  async listThreads(membership: Membership) {
    return prisma.messageThread.findMany({
      where: {
        OR: [
          { buyerCompanyId: membership.companyId },
          { supplierCompanyId: membership.companyId },
          {
            order: {
              appointments: { some: { companyId: membership.companyId, status: "ACTIVE" } },
            },
          },
        ],
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
    const include = {
      sender: { select: { id: true, name: true } },
      attachments: {
        where: { status: "ACTIVE" as const, uploadCompletedAt: { not: null } },
        select: { id: true, fileName: true, size: true },
      },
    };
    // Initial load: the LATEST window (oldest-first take would strand new
    // messages in long threads). Polling with `after` streams what follows.
    const messages = after
      ? await prisma.message.findMany({
          where: { threadId, createdAt: { gt: new Date(after) } },
          include,
          orderBy: { createdAt: "asc" },
          take: 200,
        })
      : (
          await prisma.message.findMany({
            where: { threadId },
            include,
            orderBy: { createdAt: "desc" },
            take: 200,
          })
        ).reverse();
    // Order-linked threads interleave shipment milestones with the chat, so
    // the conversation reads in business context (deferred-item: system events).
    const systemEvents = thread.orderId
      ? await prisma.orderStatusEvent.findMany({
          where: { orderId: thread.orderId },
          orderBy: { createdAt: "asc" },
          select: { id: true, status: true, note: true, eta: true, createdAt: true },
        })
      : [];
    return { thread, messages, systemEvents };
  }

  /**
   * SSE change feed: emits a ping whenever the thread has messages newer than
   * the cursor. The client refetches on ping — payloads stay on one code path
   * and reconnects (EventSource Last-Event-ID) resume from the right point.
   * Streams complete after ~55 s; the browser reconnects automatically.
   */
  streamChanges(membership: Membership, threadId: string, since: Date): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let cursor = since;
      let stopped = false;
      const tick = async () => {
        try {
          const latest = await prisma.message.findFirst({
            where: { threadId, createdAt: { gt: cursor } },
            orderBy: { createdAt: "desc" },
            select: { createdAt: true },
          });
          if (latest && !stopped) {
            cursor = latest.createdAt;
            subscriber.next({
              id: cursor.toISOString(),
              data: { changed: true },
            } as MessageEvent);
          }
        } catch {
          // transient DB error: skip this tick, the next one retries
        }
      };
      void tick();
      const interval = setInterval(tick, 2500);
      const end = setTimeout(() => subscriber.complete(), 55_000);
      return () => {
        stopped = true;
        clearInterval(interval);
        clearTimeout(end);
      };
    });
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

    // Recipients: the other pairwise party — and on order threads, every
    // appointed logistics company too (multi-party shipment conversation).
    const recipientCompanyIds = new Set<string>([thread.buyerCompanyId, thread.supplierCompanyId]);
    if (thread.orderId) {
      const appointments = await prisma.shipmentAppointment.findMany({
        where: { orderId: thread.orderId, status: "ACTIVE" },
        select: { companyId: true },
      });
      for (const a of appointments) recipientCompanyIds.add(a.companyId);
    }
    recipientCompanyIds.delete(membership.companyId);
    const recipients = await prisma.companyUserRole.findMany({
      where: { companyId: { in: [...recipientCompanyIds] }, user: { status: "ACTIVE" } },
      select: { userId: true },
    });
    const context =
      thread.order?.orderNo ?? thread.quotation?.refNo ?? thread.rfq?.refNo ?? "conversation";
    const excerpt = body.length > 140 ? `${body.slice(0, 140)}…` : body;

    await notify({
      userIds: recipients.map((r) => r.userId),
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
