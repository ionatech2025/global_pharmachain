import { prisma } from "@pharmachain/db";

/**
 * What the order page shows, reduced to one string for the live feed
 * (changeFeed). Client review 2026-11-12: a status update appeared only after
 * a manual reload. Every party's page now re-renders when any of these move:
 *
 *  - the order row (stage, ETA, freight details — `updatedAt` covers them all);
 *  - the status history (exceptions add an event without touching the order);
 *  - tracking points, proof of delivery, documents and logistics partners;
 *  - payments and disputes (their own `updatedAt`, since a status change
 *    there does not change any count).
 */
export async function orderFingerprint(orderId: string): Promise<string> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      updatedAt: true,
      pod: { select: { capturedAt: true } },
      _count: {
        select: {
          statusEvents: true,
          locations: true,
          documents: true,
          appointments: { where: { status: "ACTIVE" } },
        },
      },
      payments: { select: { updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 1 },
      disputes: { select: { updatedAt: true }, orderBy: { updatedAt: "desc" }, take: 1 },
    },
  });
  if (!order) return "gone";
  return fingerprintOf(order);
}

export interface OrderSnapshot {
  status: string;
  updatedAt: Date;
  pod: { capturedAt: Date } | null;
  _count: { statusEvents: number; locations: number; documents: number; appointments: number };
  payments: Array<{ updatedAt: Date }>;
  disputes: Array<{ updatedAt: Date }>;
}

/** Pure half of orderFingerprint (unit-tested). Short enough for an SSE id. */
export function fingerprintOf(o: OrderSnapshot): string {
  const at = (d: Date | undefined | null) => (d ? d.getTime().toString(36) : "");
  return [
    o.status,
    at(o.updatedAt),
    o._count.statusEvents,
    o._count.locations,
    o._count.documents,
    o._count.appointments,
    at(o.pod?.capturedAt),
    at(o.payments[0]?.updatedAt),
    at(o.disputes[0]?.updatedAt),
  ].join("|");
}
