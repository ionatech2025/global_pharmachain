import { describe, expect, test } from "bun:test";
import { canTransitionOrder, canTransitionRfq, nextOrderStatus } from "./state-machines";

describe("rfq transitions", () => {
  test("open can close, cancel or award", () => {
    expect(canTransitionRfq("OPEN", "CLOSED")).toBe(true);
    expect(canTransitionRfq("OPEN", "CANCELLED")).toBe(true);
    expect(canTransitionRfq("OPEN", "AWARDED")).toBe(true);
  });

  test("awarding after auto-close is allowed", () => {
    expect(canTransitionRfq("CLOSED", "AWARDED")).toBe(true);
  });

  test("terminal states are terminal", () => {
    expect(canTransitionRfq("AWARDED", "OPEN")).toBe(false);
    expect(canTransitionRfq("CANCELLED", "OPEN")).toBe(false);
    expect(canTransitionRfq("CANCELLED", "AWARDED")).toBe(false);
  });
});

describe("order shipment stages (US-701)", () => {
  test("staff move exactly one stage forward", () => {
    expect(canTransitionOrder("ORDER_CONFIRMED", "PICKUP_SCHEDULED")).toBe(true);
    expect(canTransitionOrder("PICKUP_SCHEDULED", "GOODS_COLLECTED")).toBe(true);
  });

  test("staff cannot skip or go backwards", () => {
    expect(canTransitionOrder("ORDER_CONFIRMED", "IN_TRANSIT")).toBe(false);
    expect(canTransitionOrder("IN_TRANSIT", "PICKUP_SCHEDULED")).toBe(false);
    expect(canTransitionOrder("DELIVERED", "AT_PORT")).toBe(false);
  });

  test("super admin may correct to any different stage", () => {
    expect(canTransitionOrder("IN_TRANSIT", "PICKUP_SCHEDULED", { isSuperAdmin: true })).toBe(true);
    expect(canTransitionOrder("IN_TRANSIT", "IN_TRANSIT", { isSuperAdmin: true })).toBe(false);
  });

  test("sequence walks to delivered and stops", () => {
    expect(nextOrderStatus("AT_PORT")).toBe("DELIVERED");
    expect(nextOrderStatus("DELIVERED")).toBeNull();
  });
});
