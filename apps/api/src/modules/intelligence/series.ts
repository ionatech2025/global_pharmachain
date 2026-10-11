/**
 * Pure series builders behind the intelligence charts, kept apart from the
 * database so the rules that make a chart honest can be tested directly.
 */

/** Calendar month of a timestamp, in UTC: "2026-10". */
export function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

/** The last n calendar months, oldest first, ending with the current one. */
export function lastMonths(n: number, now = new Date()): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    out.push(monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
  }
  return out;
}

/** Events per month across the window; anything outside it is not counted. */
export function monthlyCounts(dates: readonly Date[], months: readonly string[]): number[] {
  const byMonth = new Map<string, number>(months.map((m) => [m, 0]));
  for (const d of dates) {
    const key = monthKey(d);
    const count = byMonth.get(key);
    if (count !== undefined) byMonth.set(key, count + 1);
  }
  return months.map((m) => byMonth.get(m) ?? 0);
}

export interface PricedQuote {
  createdAt: Date;
  unitPrice: number | { toNumber(): number };
  currency: string;
  /** The RFQ's unit, as written ("kg", "Tablets"); absent means one unit. */
  unit?: string;
}

export interface PriceSeries {
  /** One entry per month; null where no quotation in this unit and currency. */
  series: (number | null)[];
  /** The currency the series is in — the most-quoted unit/currency pair's. */
  currency: string | null;
  /** The unit the prices are per, normalised ("kg"); null when not given. */
  unit: string | null;
  /** Quotations behind the series. */
  sampleSize: number;
  /** Quotations in the window left out for another unit or currency. */
  otherQuotes: number;
  /** First and latest priced months' averages (null without data). */
  first: number | null;
  latest: number | null;
  direction: "rising" | "falling" | "stable" | "insufficient data";
}

/** "Kg " and "kg" are one unit; the free text is otherwise kept as written. */
const unitKey = (unit: string | undefined) =>
  unit === undefined ? "" : unit.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * Monthly average unit price for ONE unit in ONE currency. A mean of USD and
 * UGX prices is not a price, nor is a mean of a price per kg and a price per
 * tablet, so the series follows the unit/currency pair most quotations in the
 * window used and counts the rest out rather than converting them. A month
 * without a quotation in that pair is null — a gap, never a price of 0.
 */
export function monthlyPriceSeries(
  quotes: readonly PricedQuote[],
  months: readonly string[],
): PriceSeries {
  const window = new Set(months);
  const inWindow = quotes.filter((q) => window.has(monthKey(q.createdAt)));

  const perPair = new Map<string, { unit: string; currency: string; count: number }>();
  for (const q of inWindow) {
    const unit = unitKey(q.unit);
    const key = `${unit}\u0000${q.currency}`;
    const entry = perPair.get(key) ?? { unit, currency: q.currency, count: 0 };
    entry.count += 1;
    perPair.set(key, entry);
  }
  // Ties break alphabetically so the choice cannot flip between renders.
  const pair =
    [...perPair.values()].sort(
      (a, b) =>
        b.count - a.count || a.currency.localeCompare(b.currency) || a.unit.localeCompare(b.unit),
    )[0] ?? null;

  const sums = new Map<string, { total: number; count: number }>();
  for (const q of inWindow) {
    if (!pair || q.currency !== pair.currency || unitKey(q.unit) !== pair.unit) continue;
    const key = monthKey(q.createdAt);
    const bucket = sums.get(key) ?? { total: 0, count: 0 };
    bucket.total += typeof q.unitPrice === "number" ? q.unitPrice : q.unitPrice.toNumber();
    bucket.count += 1;
    sums.set(key, bucket);
  }
  const series = months.map((m) => {
    const bucket = sums.get(m);
    return bucket ? Math.round((bucket.total / bucket.count) * 100) / 100 : null;
  });

  const known = series.filter((v): v is number => v !== null);
  const first = known[0] ?? null;
  const latest = known.at(-1) ?? null;
  const direction =
    first === null || latest === null || known.length < 2
      ? "insufficient data"
      : latest > first * 1.03
        ? "rising"
        : latest < first * 0.97
          ? "falling"
          : "stable";

  const sampleSize = pair?.count ?? 0;
  return {
    series,
    currency: pair?.currency ?? null,
    unit: pair?.unit ? pair.unit : null,
    sampleSize,
    otherQuotes: inWindow.length - sampleSize,
    first,
    latest,
    direction,
  };
}

/** A trend needs at least two priced months; one month is a single price. */
export const MIN_PRICED_MONTHS = 2;

export interface CategoryRef {
  id: string;
  name: string;
  slug: string;
}

export interface CategoryPriceTrend extends PriceSeries {
  category: CategoryRef;
}

export interface CategoryPriceTrends {
  /** Categories with prices in at least MIN_PRICED_MONTHS months, most-quoted first. */
  categories: CategoryPriceTrend[];
  coverage: {
    /** Quotations in the window. */
    quotations: number;
    /** Of those, on an RFQ that names a category. */
    categorised: number;
    /** Quotations per named category, most first — trend or not. */
    byCategory: Array<{ category: CategoryRef; quotations: number }>;
  };
}

/**
 * Price trends per category, never across them: a category's average is
 * like-for-like (one unit, one currency — see monthlyPriceSeries); an average
 * over every product on the platform is not a price of anything. Quotations
 * on RFQs raised for any category mix products and units, so they are counted
 * in `coverage` and priced nowhere.
 */
export function categoryPriceTrends(
  quotes: ReadonlyArray<PricedQuote & { category: CategoryRef | null }>,
  months: readonly string[],
): CategoryPriceTrends {
  const window = new Set(months);
  const inWindow = quotes.filter((q) => window.has(monthKey(q.createdAt)));

  const byCategory = new Map<string, { category: CategoryRef; quotes: PricedQuote[] }>();
  for (const q of inWindow) {
    if (!q.category) continue;
    const entry = byCategory.get(q.category.id) ?? { category: q.category, quotes: [] };
    entry.quotes.push(q);
    byCategory.set(q.category.id, entry);
  }

  const categories = [...byCategory.values()]
    .map(({ category, quotes: own }) => ({ category, ...monthlyPriceSeries(own, months) }))
    .filter((t) => t.series.filter((v) => v !== null).length >= MIN_PRICED_MONTHS)
    .sort((a, b) => b.sampleSize - a.sampleSize || a.category.name.localeCompare(b.category.name));

  return {
    categories,
    coverage: {
      quotations: inWindow.length,
      categorised: inWindow.filter((q) => q.category !== null).length,
      byCategory: [...byCategory.values()]
        .map(({ category, quotes: own }) => ({ category, quotations: own.length }))
        .sort(
          (a, b) => b.quotations - a.quotations || a.category.name.localeCompare(b.category.name),
        ),
    },
  };
}
