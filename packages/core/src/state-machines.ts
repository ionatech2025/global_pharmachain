import { ORDER_STATUSES, type OrderStatus, type RfqStatus } from "./enums";

// RFQ lifecycle (US-401/402/405/407). Awarding is allowed from CLOSED because
// RFQs auto-close at their deadline and buyers normally accept afterwards,
// while quotations are still within their validity window.
const RFQ_TRANSITIONS: Record<RfqStatus, readonly RfqStatus[]> = {
  OPEN: ["CLOSED", "CANCELLED", "AWARDED"],
  CLOSED: ["AWARDED"],
  AWARDED: [],
  CANCELLED: [],
};

export function canTransitionRfq(from: RfqStatus, to: RfqStatus): boolean {
  return RFQ_TRANSITIONS[from].includes(to);
}

export function orderStatusIndex(status: OrderStatus): number {
  return ORDER_STATUSES.indexOf(status);
}

// Shipment stages move strictly forward, one stage at a time (US-701).
// Super admins may correct to any different stage; corrections are audited.
export function canTransitionOrder(
  from: OrderStatus,
  to: OrderStatus,
  opts: { isSuperAdmin?: boolean } = {},
): boolean {
  if (opts.isSuperAdmin) return from !== to;
  return orderStatusIndex(to) === orderStatusIndex(from) + 1;
}

export function nextOrderStatus(current: OrderStatus): OrderStatus | null {
  return ORDER_STATUSES[orderStatusIndex(current) + 1] ?? null;
}
