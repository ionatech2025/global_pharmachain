import { describe, expect, test } from "bun:test";
import { convertAmount, fxRate, orderByComparablePrice } from "./fx";

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

describe("orderByComparablePrice (marketplace price sort, client review 2026-10-29)", () => {
  // 1 USD = 3,700 UGX = 130 KES
  const pairs = [
    { base: "USD", quote: "UGX", rate: 3700 },
    { base: "USD", quote: "KES", rate: 130 },
  ];
  const rows = [
    { id: "a", name: "Alpha", price: 1300, currency: "KES" }, // 10 USD
    { id: "b", name: "Beta", price: 5, currency: "USD" }, // 5 USD
    { id: "c", name: "Gamma", price: 74000, currency: "UGX" }, // 20 USD
    { id: "d", name: "Delta", price: 1, currency: "XYZ" }, // no rate
  ];

  test("compares prices in one currency, not the raw numbers", () => {
    // Raw numbers would give b (5), d (1)… and put 74,000 UGX last of all.
    expect(orderByComparablePrice(rows, pairs, "asc")).toEqual(["b", "a", "c", "d"]);
  });

  test("high to low reverses the comparable ones; the unconvertible stays last", () => {
    expect(orderByComparablePrice(rows, pairs, "desc")).toEqual(["c", "a", "b", "d"]);
  });

  test("equal prices fall back to name, so pages do not reshuffle", () => {
    const tied = [
      { id: "2", name: "Zinc", price: 10, currency: "USD" },
      { id: "1", name: "Acid", price: 1300, currency: "KES" },
    ];
    expect(orderByComparablePrice(tied, pairs, "asc")).toEqual(["1", "2"]);
  });
});
