import { describe, expect, test } from "bun:test";
import { generateRefNo } from "./refno";

describe("generateRefNo", () => {
  test("formats as PREFIX-YYYY-XXXXXXXX with 8 Crockford base32 chars", () => {
    const refNo = generateRefNo("RFQ", new Date("2026-07-17T00:00:00Z"));
    expect(refNo).toMatch(/^RFQ-2026-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{8}$/);
  });

  test("uses the UTC year", () => {
    const refNo = generateRefNo("ORD", new Date("2026-01-01T00:30:00Z"));
    expect(refNo.startsWith("ORD-2026-")).toBe(true);
  });

  test("successive calls do not collide", () => {
    const seen = new Set(Array.from({ length: 1000 }, () => generateRefNo("QUO")));
    expect(seen.size).toBe(1000);
  });
});
