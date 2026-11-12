import { describe, expect, test } from "bun:test";
import { stageConflictMessage } from "./stage-conflict";

describe("shipment stage conflicts (client review 2026-11-12, Figure 10)", () => {
  test("re-sending the current stage says the order is already there", () => {
    // Was: "Cannot move from Goods collected to Goods collected".
    expect(stageConflictMessage("GOODS_COLLECTED", "GOODS_COLLECTED")).toBe(
      "This order is already at Goods collected — it was updated after your page loaded",
    );
  });

  test("an earlier stage (someone else moved first) reads the same way", () => {
    expect(stageConflictMessage("IN_TRANSIT", "GOODS_COLLECTED")).toMatch(/already at In transit/);
  });

  test("skipping ahead names both stages and the one-at-a-time rule", () => {
    expect(stageConflictMessage("GOODS_COLLECTED", "DEPARTED")).toBe(
      "Cannot skip from Goods collected to Departed — stages move forward one at a time",
    );
  });
});
