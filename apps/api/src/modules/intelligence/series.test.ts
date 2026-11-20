import { describe, expect, test } from "bun:test";
import {
  categoryPriceTrends,
  isAnonymous,
  lastMonths,
  monthlyCounts,
  monthlyPriceSeries,
} from "./series";

const at = (iso: string) => new Date(`${iso}T12:00:00Z`);
const quote = (day: string, unitPrice: number, currency = "USD", unit = "kg") => ({
  createdAt: at(day),
  unitPrice,
  currency,
  unit,
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
    expect(result.otherQuotes).toBe(1);
  });

  test("breaks a currency tie alphabetically, so the choice is stable", () => {
    const result = monthlyPriceSeries(
      [quote("2026-08-01", 40_000, "UGX"), quote("2026-08-02", 11, "USD")],
      months,
    );
    expect(result.currency).toBe("UGX");
    expect(result.otherQuotes).toBe(1);
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
    expect(result.otherQuotes).toBe(0);
  });

  test("follows the most-quoted unit too: a price per kg is not a price per tablet", () => {
    const result = monthlyPriceSeries(
      [
        quote("2026-07-01", 12, "USD", "kg"),
        quote("2026-08-01", 11, "USD", " KG "),
        quote("2026-08-02", 0.04, "USD", "tablets"),
      ],
      months,
    );
    // "KG" with stray spaces is the same unit; the tablet price stays out.
    expect(result.unit).toBe("kg");
    expect(result.series).toEqual([12, 11, null, null]);
    expect(result.otherQuotes).toBe(1);
    expect(result.first).toBe(12);
    expect(result.latest).toBe(11);
  });

  test("accepts Prisma decimals", () => {
    const result = monthlyPriceSeries(
      [{ createdAt: at("2026-07-01"), unitPrice: { toNumber: () => 9.5 }, currency: "USD" }],
      months,
    );
    expect(result.series[0]).toBe(9.5);
  });
});

describe("categoryPriceTrends", () => {
  const months = ["2026-07", "2026-08", "2026-09", "2026-10"];
  const apis = { id: "c1", name: "APIs", slug: "apis" };
  const excipients = { id: "c2", name: "Excipients", slug: "excipients" };
  const inCategory = (
    category: typeof apis | null,
    day: string,
    price: number,
    supplierCompanyId = "s1",
    buyerCompanyId = "b1",
  ) => ({ ...quote(day, price), category, supplierCompanyId, buyerCompanyId });
  /** One quote each from three suppliers to three buyers: the smallest month the chart may show. */
  const fromThree = (category: typeof apis, day: string, prices: [number, number, number]) =>
    prices.map((price, i) => inCategory(category, day, price, `s${i + 1}`, `b${i + 1}`));

  test("prices each category on its own and never across them", () => {
    const result = categoryPriceTrends(
      [
        ...fromThree(apis, "2026-07-01", [12, 12, 12]),
        ...fromThree(apis, "2026-09-01", [13, 15, 14]),
        ...fromThree(excipients, "2026-08-01", [2, 2, 2]),
        ...fromThree(excipients, "2026-10-01", [3, 3, 3]),
      ],
      months,
    );
    expect(result.categories.map((c) => c.category.slug)).toEqual(["apis", "excipients"]);
    expect(result.categories[0]?.series).toEqual([12, null, 14, null]);
    expect(result.categories[1]?.series).toEqual([null, 2, null, 3]);
  });

  test("a category priced in one month only has no trend, but still counts in coverage", () => {
    const result = categoryPriceTrends(
      [
        ...fromThree(apis, "2026-08-01", [12, 12.5, 13]),
        inCategory(null, "2026-08-02", 11),
        inCategory(null, "2026-09-02", 11),
      ],
      months,
    );
    expect(result.categories).toEqual([]);
    expect(result.coverage.quotations).toBe(5);
    expect(result.coverage.categorised).toBe(3);
    expect(result.coverage.byCategory).toEqual([{ category: apis, quotations: 3 }]);
  });

  test("RFQs raised for any category are priced nowhere", () => {
    const result = categoryPriceTrends(
      [inCategory(null, "2026-07-01", 12), inCategory(null, "2026-10-01", 13)],
      months,
    );
    expect(result.categories).toEqual([]);
    expect(result.coverage).toEqual({ quotations: 2, categorised: 0, byCategory: [] });
  });

  test("most-quoted category first", () => {
    const result = categoryPriceTrends(
      [
        ...fromThree(excipients, "2026-07-01", [2, 2, 2]),
        ...fromThree(excipients, "2026-08-01", [2, 2, 2]),
        ...fromThree(excipients, "2026-09-01", [2, 2, 2]),
        ...fromThree(apis, "2026-07-01", [12, 12, 12]),
        ...fromThree(apis, "2026-10-01", [12, 12, 12]),
      ],
      months,
    );
    expect(result.categories.map((c) => [c.category.slug, c.sampleSize])).toEqual([
      ["excipients", 9],
      ["apis", 6],
    ]);
  });

  test("a month one supplier priced is a gap: its average would be that supplier's price", () => {
    const result = categoryPriceTrends(
      [
        inCategory(apis, "2026-07-01", 10, "s1"),
        inCategory(apis, "2026-07-09", 12, "s1"),
        ...fromThree(apis, "2026-08-01", [12, 12, 12]),
        ...fromThree(apis, "2026-09-01", [14, 14, 14]),
      ],
      months,
    );
    expect(result.categories[0]?.series).toEqual([null, 12, 14, null]);
    expect(result.categories[0]?.sampleSize).toBe(6);
    // Withheld from the price, still counted in coverage.
    expect(result.coverage.quotations).toBe(8);
  });

  test("two suppliers are not enough: either could subtract its own quote and read the other's", () => {
    const result = categoryPriceTrends(
      [
        inCategory(apis, "2026-08-01", 12.4, "s1", "b1"),
        inCategory(apis, "2026-08-02", 9.1, "s2", "b2"),
        ...fromThree(apis, "2026-09-01", [14, 14, 14]),
        ...fromThree(apis, "2026-10-01", [15, 15, 15]),
      ],
      months,
    );
    expect(result.categories[0]?.series).toEqual([null, null, 14, 15]);
  });

  test("a buyer who received two of a month's three quotes could read the third, so it is withheld", () => {
    const result = categoryPriceTrends(
      [
        inCategory(apis, "2026-08-01", 12, "s1", "b1"),
        inCategory(apis, "2026-08-02", 13, "s2", "b1"),
        inCategory(apis, "2026-08-03", 11, "s3", "b2"),
        ...fromThree(apis, "2026-09-01", [14, 14, 14]),
        ...fromThree(apis, "2026-10-01", [15, 15, 15]),
      ],
      months,
    );
    expect(result.categories[0]?.series).toEqual([null, null, 14, 15]);
  });
});

describe("isAnonymous", () => {
  const order = (id: string, buyer: string, seller: string) => ({
    key: id,
    parties: [buyer, seller],
  });

  test("three deals between six companies can be summed", () => {
    expect(
      isAnonymous([order("o1", "b1", "s1"), order("o2", "b2", "s2"), order("o3", "b3", "s3")]),
    ).toBe(true);
  });

  test("a company party to two of three deals could read the third off the total", () => {
    expect(
      isAnonymous([order("o1", "x", "s1"), order("o2", "b2", "x"), order("o3", "b3", "s3")]),
    ).toBe(false);
  });

  test("a company party to every deal learns nothing new", () => {
    expect(
      isAnonymous([order("o1", "x", "s1"), order("o2", "x", "s2"), order("o3", "x", "s3")]),
    ).toBe(true);
  });

  test("one contribution, or none, is never published", () => {
    expect(isAnonymous([order("o1", "b1", "s1")])).toBe(false);
    expect(isAnonymous([])).toBe(false);
  });
});
