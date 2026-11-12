import { describe, expect, test } from "bun:test";
import { fingerprintOf, type OrderSnapshot } from "./order-fingerprint";

const base: OrderSnapshot = {
  status: "GOODS_COLLECTED",
  updatedAt: new Date("2026-11-12T09:31:00Z"),
  pod: null,
  _count: { statusEvents: 3, locations: 0, documents: 2, appointments: 1 },
  payments: [],
  disputes: [],
};

describe("order live-feed fingerprint (client review 2026-11-12)", () => {
  test("is stable while nothing changes", () => {
    expect(fingerprintOf(base)).toBe(fingerprintOf({ ...base }));
  });

  test("moves on everything the order page shows", () => {
    const before = fingerprintOf(base);
    const variants: OrderSnapshot[] = [
      // The reported case: a stage change (and its ETA) moves the order row.
      { ...base, status: "IN_TRANSIT", updatedAt: new Date("2026-11-12T09:34:00Z") },
      // An exception adds a history event without touching the order row.
      { ...base, _count: { ...base._count, statusEvents: 4 } },
      { ...base, _count: { ...base._count, locations: 1 } },
      { ...base, _count: { ...base._count, documents: 3 } },
      { ...base, _count: { ...base._count, appointments: 0 } },
      { ...base, pod: { capturedAt: new Date("2026-11-12T10:00:00Z") } },
      { ...base, payments: [{ updatedAt: new Date("2026-11-12T10:01:00Z") }] },
      { ...base, disputes: [{ updatedAt: new Date("2026-11-12T10:02:00Z") }] },
    ];
    const seen = new Set([before]);
    for (const v of variants) seen.add(fingerprintOf(v));
    expect(seen.size).toBe(variants.length + 1);
  });

  test("fits comfortably in an SSE event id", () => {
    const busy: OrderSnapshot = {
      ...base,
      pod: { capturedAt: new Date() },
      payments: [{ updatedAt: new Date() }],
      disputes: [{ updatedAt: new Date() }],
      _count: { statusEvents: 9999, locations: 9999, documents: 9999, appointments: 9 },
    };
    expect(fingerprintOf(busy).length).toBeLessThan(200);
  });
});
