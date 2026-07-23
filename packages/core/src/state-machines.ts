import {
  type DocumentKind,
  type FreightMode,
  type LogisticsRole,
  ORDER_STATUSES,
  type OrderStatus,
  type RfqStatus,
} from "./enums";

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

// ─── Phase 2: who may drive which stage ──────────────────────────────────────
// Seller staff and the appointed forwarder run the lifecycle end to end;
// scoped roles only advance the legs they physically handle; the buyer
// confirms receipt as the final stage.

const TRANSPORTER_STAGES: readonly OrderStatus[] = [
  "GOODS_COLLECTED",
  "INLAND_TRANSPORT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];
const CLEARING_AGENT_STAGES: readonly OrderStatus[] = [
  "CUSTOMS_ORIGIN",
  "DEPARTED",
  "CUSTOMS_DESTINATION",
];
export const BUYER_CONFIRM_STAGE: OrderStatus = "DELIVERY_CONFIRMED";

export type ShipmentActor = "seller" | "buyer" | LogisticsRole;

/** May this actor advance the shipment INTO stage `to`? (Forward-only rule
 *  and super-admin corrections are checked separately by canTransitionOrder.) */
export function canActorSetStage(actor: ShipmentActor, to: OrderStatus): boolean {
  switch (actor) {
    case "buyer":
      return to === BUYER_CONFIRM_STAGE;
    case "seller":
    case "FORWARDER":
      return to !== BUYER_CONFIRM_STAGE;
    case "TRANSPORTER":
      return TRANSPORTER_STAGES.includes(to);
    case "CLEARING_AGENT":
      return CLEARING_AGENT_STAGES.includes(to);
  }
}

// ─── Phase 2: shipment document checklist ────────────────────────────────────

export interface ShipmentDocContext {
  freightMode?: FreightMode | null;
  dangerousGoods?: boolean;
  phytoRequired?: boolean;
}

/** Document kinds this shipment is expected to carry before customs — the
 *  basis of the "missing shipment document" alert and the checklist UI. */
export function requiredShipmentDocKinds(ctx: ShipmentDocContext): DocumentKind[] {
  const kinds: DocumentKind[] = ["COMMERCIAL_INVOICE", "PACKING_LIST", "CERTIFICATE_OF_ORIGIN"];
  if (ctx.freightMode === "SEA") kinds.push("BILL_OF_LADING");
  if (ctx.freightMode === "AIR") kinds.push("AIR_WAYBILL");
  if (ctx.freightMode === "LAND" || ctx.freightMode === "MULTIMODAL") kinds.push("BILL_OF_LADING");
  if (ctx.dangerousGoods) kinds.push("DANGEROUS_GOODS_DECLARATION");
  if (ctx.phytoRequired) kinds.push("PHYTOSANITARY_CERTIFICATE");
  return kinds;
}
