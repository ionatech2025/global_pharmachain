import { describe, expect, test } from "bun:test";
import { convertAmount, fxRate } from "./fx";

const PAIRS = [
  { base: "USD", quote: "UGX", rate: 3800 },
  { base: "USD", quote: "KES", rate: 129 },
  { base: "EUR", quote: "USD", rate: 1.08 },
];

describe("fx conversion (Phase 3 §3)", () => {
  test("identity and direct pairs", () => {
    expect(fxRate(PAIRS, "USD", "USD")).toBe(1);
    expect(fxRate(PAIRS, "USD", "UGX")).toBe(3800);
  });

  test("inverse pairs invert the stored rate", () => {
    expect(fxRate(PAIRS, "UGX", "USD")).toBeCloseTo(1 / 3800, 10);
    expect(fxRate(PAIRS, "USD", "EUR")).toBeCloseTo(1 / 1.08, 10);
  });

  test("triangulates through USD", () => {
    // UGX → KES = (UGX→USD) × (USD→KES)
    expect(fxRate(PAIRS, "UGX", "KES")).toBeCloseTo(129 / 3800, 10);
    expect(convertAmount(PAIRS, 38_000, "UGX", "KES")).toBeCloseTo(1290, 6);
  });

  test("null when no path exists", () => {
    expect(fxRate(PAIRS, "UGX", "JPY")).toBeNull();
    expect(convertAmount([], 10, "USD", "UGX")).toBeNull();
  });
});
