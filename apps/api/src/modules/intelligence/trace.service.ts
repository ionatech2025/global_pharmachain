import { Injectable } from "@nestjs/common";
import type { PdfTable } from "@pharmachain/core";
import {
  hashPayload,
  ORDER_STATUS_LABELS,
  TRACE_GENESIS,
  traceHash,
  verifyChain,
} from "@pharmachain/core";
import type { Prisma } from "@pharmachain/db";
import { prisma } from "@pharmachain/db";
import { notFound } from "../../common/errors";
import type { AuthUser, Membership } from "../../lib/context";
import { resolveShipmentRole } from "../../lib/shipment-access";

interface CanonicalEvent {
  type: string;
  at: string;
  payload: Record<string, unknown>;
}

/**
 * Traceability ledger (Phase 5 §2). The canonical event list is derived
 * deterministically from the order's real history (creation, every status
 * event, document uploads, POD, invoices, confirmed payments). On first read
 * the chain is sealed into the append-only TraceEvent table; later reads
 * extend it. Verification checks BOTH that the sealed chain is internally
 * intact (hash links) and that live history still matches what was sealed —
 * so editing history after the fact is detected, not absorbed.
 */
@Injectable()
export class TraceService {
  private async canonicalEvents(orderId: string): Promise<CanonicalEvent[]> {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: {
        statusEvents: { orderBy: { createdAt: "asc" } },
        documents: {
          where: { uploadCompletedAt: { not: null } },
          orderBy: { createdAt: "asc" },
          select: { id: true, kind: true, fileName: true, version: true, createdAt: true },
        },
        pod: true,
        invoices: { orderBy: { createdAt: "asc" } },
        payments: { where: { status: "CONFIRMED" }, orderBy: { confirmedAt: "asc" } },
      },
    });
    if (!order) throw notFound("Order not found");
    const events: CanonicalEvent[] = [
      {
        type: "order.created",
        at: order.createdAt.toISOString(),
        payload: {
          orderNo: order.orderNo,
          title: order.title,
          quantity: String(order.quantity),
          unit: order.unit,
          buyerCompanyId: order.buyerCompanyId,
          sellerCompanyId: order.sellerCompanyId,
        },
      },
      ...order.statusEvents.map((e) => ({
        type: e.exception ? "shipment.exception" : "shipment.status",
        at: e.createdAt.toISOString(),
        payload: {
          status: e.status,
          note: e.note ?? null,
          exception: e.exception ?? null,
          actorUserId: e.actorUserId,
        },
      })),
      ...order.documents.map((d) => ({
        type: "document.attached",
        at: d.createdAt.toISOString(),
        payload: { documentId: d.id, kind: d.kind, fileName: d.fileName, version: d.version },
      })),
      ...(order.pod
        ? [
            {
              type: "delivery.proof",
              at: order.pod.capturedAt.toISOString(),
              payload: {
                signedByName: order.pod.signedByName,
                photoDocumentId: order.pod.photoDocumentId ?? null,
              },
            },
          ]
        : []),
      ...order.invoices.map((inv) => ({
        type: "invoice.issued",
        at: inv.createdAt.toISOString(),
        payload: { invoiceNo: inv.invoiceNo, total: String(inv.total), currency: inv.currency },
      })),
      ...order.payments.map((p) => ({
        type: "payment.confirmed",
        at: (p.confirmedAt ?? p.createdAt).toISOString(),
        payload: { providerRef: p.providerRef, amount: String(p.amount), currency: p.currency },
      })),
    ];
    return events.sort((a, b) => a.at.localeCompare(b.at) || a.type.localeCompare(b.type));
  }

  /**
   * Seal any canonical events not yet in the chain (append-only). A
   * per-order advisory lock serialises concurrent first views (review
   * finding: simultaneous extension raced on the (orderId, seq) unique
   * index and 500'd the loser); the transaction re-reads the sealed tail
   * under the lock so each writer extends from the true head.
   */
  private async extendChain(orderId: string) {
    const canonical = await this.canonicalEvents(orderId);
    await prisma.$transaction(
      async (tx) => {
        // $executeRaw, not $queryRaw: the blocking lock returns SQL `void`,
        // which queryRaw cannot deserialize (executeRaw discards the row).
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`trace:${orderId}`})::bigint)`;
        const sealed = await tx.traceEvent.findMany({
          where: { orderId },
          orderBy: { seq: "asc" },
          select: { hash: true },
        });
        let prevHash = sealed.length ? (sealed[sealed.length - 1]?.hash as string) : TRACE_GENESIS;
        for (let i = sealed.length; i < canonical.length; i += 1) {
          const event = canonical[i] as CanonicalEvent;
          const payloadHash = await hashPayload(event.payload);
          const input = {
            seq: i + 1,
            type: event.type,
            at: event.at,
            payloadHash,
            prevHash,
          };
          const hash = await traceHash(input);
          await tx.traceEvent.create({
            data: {
              orderId,
              seq: input.seq,
              type: input.type,
              at: input.at,
              payload: event.payload as Prisma.InputJsonValue,
              payloadHash,
              prevHash,
              hash,
            },
          });
          prevHash = hash;
        }
      },
      { timeout: 15_000 },
    );
    return { canonical };
  }

  async chainFor(user: AuthUser, membership: Membership | undefined, orderId: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw notFound("Order not found");
    const role = await resolveShipmentRole(user, membership, order);
    if (!role) throw notFound("Order not found");

    const { canonical } = await this.extendChain(orderId);
    const sealed = await prisma.traceEvent.findMany({
      where: { orderId },
      orderBy: { seq: "asc" },
    });
    const chain = await verifyChain(
      sealed.map((e) => ({
        seq: e.seq,
        type: e.type,
        at: e.at ?? "",
        payloadHash: e.payloadHash,
        prevHash: e.prevHash,
        hash: e.hash,
      })),
    );
    // History-vs-ledger cross-check: recompute payload hashes from live data.
    let historyMatches = true;
    let divergedAtSeq: number | null = null;
    for (let i = 0; i < Math.min(sealed.length, canonical.length); i += 1) {
      const expected = await hashPayload((canonical[i] as CanonicalEvent).payload);
      if (expected !== (sealed[i]?.payloadHash as string)) {
        historyMatches = false;
        divergedAtSeq = i + 1;
        break;
      }
    }
    return {
      orderNo: order.orderNo,
      events: sealed.map((e) => ({
        seq: e.seq,
        type: e.type,
        at: e.at,
        payload: e.payload,
        hash: e.hash,
        prevHash: e.prevHash,
      })),
      verification: {
        chainIntact: chain.valid,
        brokenAtSeq: chain.brokenAtSeq,
        historyMatches,
        divergedAtSeq,
        headHash: sealed.length ? sealed[sealed.length - 1]?.hash : TRACE_GENESIS,
        length: sealed.length,
      },
    };
  }

  /** Public anti-counterfeit check: does this hash belong to this order's
   *  intact chain? Reveals stage + time only — no commercial details. */
  async publicVerify(orderNo: string, hash: string) {
    const order = await prisma.order.findUnique({ where: { orderNo } });
    if (!order) return { authentic: false, reason: "unknown reference" };
    const event = await prisma.traceEvent.findFirst({ where: { orderId: order.id, hash } });
    if (!event) return { authentic: false, reason: "hash not on this order's ledger" };
    const sealed = await prisma.traceEvent.findMany({
      where: { orderId: order.id },
      orderBy: { seq: "asc" },
    });
    const chain = await verifyChain(
      sealed.map((e) => ({
        seq: e.seq,
        type: e.type,
        at: e.at ?? "",
        payloadHash: e.payloadHash,
        prevHash: e.prevHash,
        hash: e.hash,
      })),
    );
    if (!chain.valid) return { authentic: false, reason: "ledger integrity check failed" };
    return {
      authentic: true,
      orderNo,
      eventType: event.type,
      recordedAt: event.createdAt,
      seq: event.seq,
      chainLength: sealed.length,
    };
  }

  /** Regulatory-grade traceability report as a table (Phase 5 §2). */
  reportTable(data: Awaited<ReturnType<TraceService["chainFor"]>>): PdfTable {
    return {
      title: `Traceability report — ${data.orderNo}`,
      subtitle: `Chain ${data.verification.chainIntact && data.verification.historyMatches ? "VERIFIED" : "FAILED"} · ${data.verification.length} event(s) · head ${String(data.verification.headHash).slice(0, 16)}…`,
      columns: ["Seq", "Event", "Payload hash", "Hash"],
      rows: data.events.map((e) => [
        String(e.seq),
        e.type === "shipment.status"
          ? `shipment.status: ${ORDER_STATUS_LABELS[(e.payload as { status: keyof typeof ORDER_STATUS_LABELS }).status] ?? ""}`
          : e.type,
        String((e as { payload: unknown; prevHash: string }).prevHash).slice(0, 18),
        e.hash.slice(0, 18),
      ]),
    };
  }

  /** Platform coverage: orders whose sealed chain verifies end-to-end. */
  async coverage() {
    const orders = await prisma.order.findMany({ select: { id: true }, take: 500 });
    let intact = 0;
    for (const order of orders) {
      await this.extendChain(order.id);
      const sealed = await prisma.traceEvent.findMany({
        where: { orderId: order.id },
        orderBy: { seq: "asc" },
      });
      const chain = await verifyChain(
        sealed.map((e) => ({
          seq: e.seq,
          type: e.type,
          at: e.at ?? "",
          payloadHash: e.payloadHash,
          prevHash: e.prevHash,
          hash: e.hash,
        })),
      );
      if (chain.valid && sealed.length > 0) intact += 1;
    }
    return {
      orders: orders.length,
      intactChains: intact,
      coveragePct: orders.length ? Math.round((intact / orders.length) * 1000) / 10 : 100,
    };
  }
}
