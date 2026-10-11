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
}

export interface PriceSeries {
  /** One entry per month; null where no quotation in `currency` was made. */
  series: (number | null)[];
  /** The currency the series is in — the one most quotations used. */
  currency: string | null;
  /** Quotations behind the series. */
  sampleSize: number;
  /** Quotations in the window left out for being in another currency. */
  otherCurrencyQuotes: number;
  direction: "rising" | "falling" | "stable" | "insufficient data";
}

/**
 * Monthly average unit price in ONE currency. A mean of USD and UGX prices is
 * not a price, so the series follows the currency most quotations in the
 * window used and counts the rest out rather than converting them. A month
 * without a quotation in that currency is null — a gap, never a price of 0.
 */
export function monthlyPriceSeries(
  quotes: readonly PricedQuote[],
  months: readonly string[],
): PriceSeries {
  const window = new Set(months);
  const inWindow = quotes.filter((q) => window.has(monthKey(q.createdAt)));

  const perCurrency = new Map<string, number>();
  for (const q of inWindow) perCurrency.set(q.currency, (perCurrency.get(q.currency) ?? 0) + 1);
  // Ties break alphabetically so the choice cannot flip between renders.
  const currency =
    [...perCurrency].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;

  const sums = new Map<string, { total: number; count: number }>();
  for (const q of inWindow) {
    if (q.currency !== currency) continue;
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
  const first = known[0];
  const last = known.at(-1);
  const direction =
    first === undefined || last === undefined || known.length < 2
      ? "insufficient data"
      : last > first * 1.03
        ? "rising"
        : last < first * 0.97
          ? "falling"
          : "stable";

  const sampleSize = currency ? (perCurrency.get(currency) ?? 0) : 0;
  return {
    series,
    currency,
    sampleSize,
    otherCurrencyQuotes: inWindow.length - sampleSize,
    direction,
  };
}
