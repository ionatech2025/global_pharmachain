import { canActorSetStage, nextOrderStatus } from "@pharmachain/core";
import type { OrderDetail } from "@/lib/api/types";

export type StatusMode = "advance" | "confirm" | "correct";

/** Which status action, if any, this viewer has on the order. Client review
 *  2026-11-12: everyone on the shipment saw "Advance to …", including parties
 *  the API then refused (the supplier at "Delivered" got a 403 trying to confirm
 *  the buyer's receipt), and nobody could tell who completes stage 13. */
export function statusModeFor(order: OrderDetail): StatusMode | null {
  if (order.viewerRole === "admin") return "correct";
  const next = nextOrderStatus(order.status);
  if (!next || !canActorSetStage(order.viewerRole, next)) return null;
  return order.viewerRole === "buyer" ? "confirm" : "advance";
}
