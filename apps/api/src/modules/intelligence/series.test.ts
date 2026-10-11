import { describe, expect, test } from "bun:test";
import { lastMonths, monthlyCounts, monthlyPriceSeries } from "./series";

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);
const quote = (day: string, unitPrice: number, currency = "USD") => ({
  createdAt: at(day),
  unitPrice,
  currency,
});

describe("lastMonths", () => {
  test("ends with the current month and crosses the year boundary", () => {
    expect(lastMonths(3, at("2026-01-15"))).toEqual(["2025-11", "2025-12", "2026-01"]);
  });
});

describe("monthlyCounts", () => {
  test("counts events per month and ignores anything outside the window", () => {
    const months = ["2026-08", "2026-09", "2026-10"];
    const dates = [at("2026-07-31"), at("2026-08-02"), at("2026-08-20"), at("2026-10-01")];
    expect(monthlyCounts(dates, months)).toEqual([2, 0, 1]);
  });
});

describe("monthlyPriceSeries", () => {
  const months = ["2026-07", "2026-08", "2026-09", "2026-10"];

  test("a month without quotations is a gap, never a price of zero", () => {
    const result = monthlyPriceSeries(
      [quote("2026-07-03", 10), quote("2026-07-20", 12), quote("2026-10-02", 13)],
      months,
    );
    expect(result.series).toEqual([11, null, null, 13]);
    expect(result.sampleSize).toBe(3);
  });

  test("follows the most-quoted currency and counts the rest out unconverted", () => {
    const result = monthlyPriceSeries(
      [
        quote("2026-08-01", 12),
        quote("2026-08-09", 14),
        quote("2026-09-01", 13),
        quote("2026-08-05", 45_000, "UGX"),
      ],
      months,
    );
    expect(result.currency).toBe("USD");
    // The UGX quotation would have dragged August's mean past 15,000.
    expect(result.series).toEqual([null, 13, 13, null]);
    expect(result.sampleSize).toBe(3);
    expect(result.otherCurrencyQuotes).toBe(1);
  });

  test("breaks a currency tie alphabetically, so the choice is stable", () => {
    const result = monthlyPriceSeries(
      [quote("2026-08-01", 40_000, "UGX"), quote("2026-08-02", 11, "USD")],
      months,
    );
    expect(result.currency).toBe("UGX");
    expect(result.otherCurrencyQuotes).toBe(1);
  });

  test("direction compares the first and last priced months, skipping gaps", () => {
    const falling = monthlyPriceSeries(
      [quote("2026-07-01", 13), quote("2026-10-01", 11.5)],
      months,
    );
    expect(falling.direction).toBe("falling");
    const stable = monthlyPriceSeries([quote("2026-07-01", 10), quote("2026-10-01", 10.2)], months);
    expect(stable.direction).toBe("stable");
    const single = monthlyPriceSeries([quote("2026-07-01", 10)], months);
    expect(single.direction).toBe("insufficient data");
  });

  test("quotations outside the window count for nothing", () => {
    const result = monthlyPriceSeries([quote("2026-06-30", 99), quote("2026-11-01", 99)], months);
    expect(result.currency).toBeNull();
    expect(result.series).toEqual([null, null, null, null]);
    expect(result.sampleSize).toBe(0);
    expect(result.otherCurrencyQuotes).toBe(0);
  });

  test("accepts Prisma decimals", () => {
    const result = monthlyPriceSeries(
      [{ createdAt: at("2026-07-01"), unitPrice: { toNumber: () => 9.5 }, currency: "USD" }],
      months,
    );
    expect(result.series[0]).toBe(9.5);
  });
});
