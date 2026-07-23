import { describe, expect, test } from "bun:test";
import { ORDER_STATUSES } from "./enums";
import {
  canActorSetStage,
  canTransitionOrder,
  canTransitionRfq,
  nextOrderStatus,
  requiredShipmentDocKinds,
} from "./state-machines";

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

describe("order shipment stages (US-701 / Phase 2 §1)", () => {
  test("the full lifecycle has 13 forward-only stages", () => {
    expect(ORDER_STATUSES).toHaveLength(13);
    expect(ORDER_STATUSES[0]).toBe("ORDER_CONFIRMED");
    expect(ORDER_STATUSES[12]).toBe("DELIVERY_CONFIRMED");
  });

  test("staff move exactly one stage forward", () => {
    expect(canTransitionOrder("ORDER_CONFIRMED", "PICKUP_SCHEDULED")).toBe(true);
    expect(canTransitionOrder("PICKUP_SCHEDULED", "GOODS_COLLECTED")).toBe(true);
    expect(canTransitionOrder("IN_TRANSIT", "AT_PORT_OF_ORIGIN")).toBe(true);
    expect(canTransitionOrder("CUSTOMS_DESTINATION", "INLAND_TRANSPORT")).toBe(true);
    expect(canTransitionOrder("DELIVERED", "DELIVERY_CONFIRMED")).toBe(true);
  });

  test("staff cannot skip or go backwards", () => {
    expect(canTransitionOrder("ORDER_CONFIRMED", "IN_TRANSIT")).toBe(false);
    expect(canTransitionOrder("IN_TRANSIT", "PICKUP_SCHEDULED")).toBe(false);
    expect(canTransitionOrder("DELIVERED", "AT_PORT_OF_DESTINATION")).toBe(false);
  });

  test("super admin may correct to any different stage", () => {
    expect(canTransitionOrder("IN_TRANSIT", "PICKUP_SCHEDULED", { isSuperAdmin: true })).toBe(true);
    expect(canTransitionOrder("IN_TRANSIT", "IN_TRANSIT", { isSuperAdmin: true })).toBe(false);
  });

  test("sequence walks the whole scale and stops at delivery confirmed", () => {
    expect(nextOrderStatus("AT_PORT_OF_ORIGIN")).toBe("CUSTOMS_ORIGIN");
    expect(nextOrderStatus("OUT_FOR_DELIVERY")).toBe("DELIVERED");
    expect(nextOrderStatus("DELIVERED")).toBe("DELIVERY_CONFIRMED");
    expect(nextOrderStatus("DELIVERY_CONFIRMED")).toBeNull();
  });
});

describe("shipment actor scopes (Phase 2 §2–3)", () => {
  test("seller and forwarder drive everything except buyer confirmation", () => {
    expect(canActorSetStage("seller", "CUSTOMS_ORIGIN")).toBe(true);
    expect(canActorSetStage("FORWARDER", "DEPARTED")).toBe(true);
    expect(canActorSetStage("seller", "DELIVERY_CONFIRMED")).toBe(false);
    expect(canActorSetStage("FORWARDER", "DELIVERY_CONFIRMED")).toBe(false);
  });

  test("buyer only confirms receipt", () => {
    expect(canActorSetStage("buyer", "DELIVERY_CONFIRMED")).toBe(true);
    expect(canActorSetStage("buyer", "IN_TRANSIT")).toBe(false);
  });

  test("transporter drives road legs, clearing agent drives customs", () => {
    expect(canActorSetStage("TRANSPORTER", "OUT_FOR_DELIVERY")).toBe(true);
    expect(canActorSetStage("TRANSPORTER", "CUSTOMS_ORIGIN")).toBe(false);
    expect(canActorSetStage("CLEARING_AGENT", "CUSTOMS_DESTINATION")).toBe(true);
    expect(canActorSetStage("CLEARING_AGENT", "OUT_FOR_DELIVERY")).toBe(false);
  });
});

describe("shipment document checklist (Phase 2 §2)", () => {
  test("mode picks the transport document; flags add declarations", () => {
    expect(requiredShipmentDocKinds({ freightMode: "SEA" })).toContain("BILL_OF_LADING");
    expect(requiredShipmentDocKinds({ freightMode: "AIR" })).toContain("AIR_WAYBILL");
    expect(requiredShipmentDocKinds({ freightMode: "AIR" })).not.toContain("BILL_OF_LADING");
    expect(requiredShipmentDocKinds({ dangerousGoods: true })).toContain(
      "DANGEROUS_GOODS_DECLARATION",
    );
    expect(requiredShipmentDocKinds({ phytoRequired: true })).toContain(
      "PHYTOSANITARY_CERTIFICATE",
    );
    expect(requiredShipmentDocKinds({})).toEqual([
      "COMMERCIAL_INVOICE",
      "PACKING_LIST",
      "CERTIFICATE_OF_ORIGIN",
    ]);
  });
});
