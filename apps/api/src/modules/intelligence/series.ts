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

/**
 * The last n months that have ended. Published prices and deal values come
 * only from closed periods: a figure that moves while you watch shows the
 * value of whatever single record moved it.
 */
export function completedMonths(n: number, now = new Date()): string[] {
  return lastMonths(n, new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)));
}

/** The last calendar quarter that has ended, as [from, to) in UTC. */
export function lastCompletedQuarter(now = new Date()): { from: Date; to: Date; label: string } {
  const q = Math.floor(now.getUTCMonth() / 3);
  const to = new Date(Date.UTC(now.getUTCFullYear(), q * 3, 1));
  const from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - 3, 1));
  return { from, to, label: `${from.getUTCFullYear()}-Q${from.getUTCMonth() / 3 + 1}` };
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

/** One figure inside a published sum or average. */
export interface Contribution {
  /** Whose figure must stay hidden: the quoting supplier, or one deal. */
  key: string;
  /** Companies that already know the figure: its owner and counterparties. */
  parties: readonly string[];
}

/**
 * Whether a sum or average over these figures may be shown to other companies.
 * Any viewer can take out the figures it already knows; what remains must
 * still blend at least two contributors (or nothing), otherwise the viewer has
 * read one competitor's price or one deal's value off the aggregate.
 */
export function isAnonymous(contributions: readonly Contribution[]): boolean {
  const blended = (rest: readonly Contribution[]) => new Set(rest.map((c) => c.key)).size;
  if (blended(contributions) < 2) return false;
  for (const party of new Set(contributions.flatMap((c) => c.parties))) {
    const left = blended(contributions.filter((c) => !c.parties.includes(party)));
    if (left === 1) return false;
  }
  return true;
}

/**
 * A quotation as the published price figures see it. Who can ever know a
 * price must be settled before it is blended, so only losing quotations on
 * RFQs whose award is decided count: the winning price becomes the order's
 * price, which the buyer's logistics partners read, and an undecided RFQ may
 * still make any quote a winner.
 */
export type PartiedQuote = PricedQuote & {
  supplierCompanyId: string;
  buyerCompanyId: string;
  /** The RFQ is awarded or cancelled, or closed with no quote left that could still win. */
  rfqSettled: boolean;
  /** This quotation, or another version from the same supplier, won the RFQ. */
  accepted: boolean;
};

/** What the published figures need to know about one quotation and its RFQ. */
export interface QuoteStandingInput {
  status: string;
  supplierCompanyId: string;
  rfq: {
    status: string;
    /** Some quotation on the RFQ is ACTIVE and inside its validity, so it could still be awarded. */
    hasLiveQuote: boolean;
    /** The seller on the order created from the RFQ, if it was awarded. */
    winnerCompanyId: string | null;
  };
}

/**
 * Whether a quotation counts as won, and whether its RFQ's award is settled.
 * Every version from the winner counts as won: an earlier one often carries
 * the order's price, which the buyer's logistics partners read. An RFQ is
 * settled once awarded or cancelled, or closed with no quote left that could
 * still win (an award needs an ACTIVE quote inside its validity).
 */
export function quoteStanding(
  q: QuoteStandingInput,
): Pick<PartiedQuote, "accepted" | "rfqSettled"> {
  return {
    accepted: q.status === "ACCEPTED" || q.rfq.winnerCompanyId === q.supplierCompanyId,
    rfqSettled:
      q.rfq.status === "AWARDED" ||
      q.rfq.status === "CANCELLED" ||
      (q.rfq.status === "CLOSED" && !q.rfq.hasLiveQuote),
  };
}

/**
 * The quotations behind every unit/currency month the price figures may show.
 * A month waits until every RFQ quoted in it is settled, so it never changes
 * once shown; then its losing quotations are published only if no company can
 * isolate one supplier's price from their average (isAnonymous).
 */
export function publishableQuotes<Q extends PartiedQuote>(quotes: readonly Q[]): Q[] {
  const buckets = new Map<string, Q[]>();
  for (const q of quotes) {
    const key = `${q.currency}|${unitKey(q.unit)}|${monthKey(q.createdAt)}`;
    buckets.set(key, [...(buckets.get(key) ?? []), q]);
  }
  return [...buckets.values()]
    .filter((bucket) => bucket.every((q) => q.rfqSettled))
    .map((bucket) => bucket.filter((q) => !q.accepted))
    .filter((losing) =>
      isAnonymous(
        losing.map((q) => ({
          key: q.supplierCompanyId,
          parties: [q.supplierCompanyId, q.buyerCompanyId],
        })),
      ),
    )
    .flat();
}

/**
 * One average over the same months the chart may show, in their most-quoted
 * unit and currency: built only from publishable months, so comparing it with
 * the chart cannot recover a month the chart withholds.
 */
export function publishedAverage(
  quotes: readonly PartiedQuote[],
  months: readonly string[],
): { average: number; currency: string; unit: string | null; quotations: number } | null {
  const window = new Set(months);
  const shown = publishableQuotes(quotes.filter((q) => window.has(monthKey(q.createdAt))));
  const { currency, unit } = monthlyPriceSeries(shown, months);
  const inPair = shown.filter((q) => q.currency === currency && unitKey(q.unit) === (unit ?? ""));
  if (currency === null || inPair.length === 0) return null;
  const total = inPair.reduce(
    (t, q) => t + (typeof q.unitPrice === "number" ? q.unitPrice : q.unitPrice.toNumber()),
    0,
  );
  return {
    average: Math.round((total / inPair.length) * 100) / 100,
    currency,
    unit,
    quotations: inPair.length,
  };
}

/** One deal inside a published total. */
export interface Deal {
  id: string;
  value: number;
  /** Delivery confirmed: nobody new can be appointed to it, so who knows its value is final. */
  settled: boolean;
  /** Buyer, seller and every company ever appointed to it. */
  parties: readonly string[];
}

/** The total of these deals, or null while it could expose one deal's value. */
export function dealTotal(deals: readonly Deal[]): number | null {
  if (!deals.every((d) => d.settled)) return null;
  if (!isAnonymous(deals.map((d) => ({ key: d.id, parties: d.parties })))) return null;
  return Math.round(deals.reduce((t, d) => t + d.value, 0) * 100) / 100;
}

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
 * in `coverage` and priced nowhere. A month that would expose one supplier's
 * price (see isAnonymous) is a gap, though its quotations still count in
 * `coverage`.
 */
export function categoryPriceTrends(
  quotes: ReadonlyArray<PartiedQuote & { category: CategoryRef | null }>,
  months: readonly string[],
): CategoryPriceTrends {
  const window = new Set(months);
  const inWindow = quotes.filter((q) => window.has(monthKey(q.createdAt)));

  const byCategory = new Map<string, { category: CategoryRef; quotes: PartiedQuote[] }>();
  for (const q of inWindow) {
    if (!q.category) continue;
    const entry = byCategory.get(q.category.id) ?? { category: q.category, quotes: [] };
    entry.quotes.push(q);
    byCategory.set(q.category.id, entry);
  }

  const categories = [...byCategory.values()]
    .map(({ category, quotes: own }) => ({
      category,
      ...monthlyPriceSeries(publishableQuotes(own), months),
    }))
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
