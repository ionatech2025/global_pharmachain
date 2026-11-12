import { ORDER_STATUS_LABELS, type OrderStatus, orderStatusIndex } from "@pharmachain/core";

/**
 * Why a stage change was refused, in words the person can act on. Client
 * review 2026-11-12 (Figure 10): "Cannot move from Goods collected to Goods
 * collected" — the dialog had re-sent the stage the order was already at. That
 * stale form is fixed; this keeps a genuine race (another party moved the
 * order first) from reading like nonsense.
 */
export function stageConflictMessage(from: OrderStatus, to: OrderStatus): string {
  if (orderStatusIndex(to) <= orderStatusIndex(from)) {
    return `This order is already at ${ORDER_STATUS_LABELS[from]} — it was updated after your page loaded`;
  }
  return `Cannot skip from ${ORDER_STATUS_LABELS[from]} to ${ORDER_STATUS_LABELS[to]} — stages move forward one at a time`;
}
