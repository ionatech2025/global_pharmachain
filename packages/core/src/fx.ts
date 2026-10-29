/**
 * Display-currency conversion over the ExchangeRate table (Phase 3 §3).
 * Rates are stored as base→quote pairs; conversion tries the direct pair,
 * the inverse, then triangulates through USD. Purely for display and
 * reporting — settlement always stays in the document's own currency.
 */

export interface FxPair {
  base: string;
  quote: string;
  rate: number;
}

function direct(pairs: readonly FxPair[], from: string, to: string): number | null {
  const hit = pairs.find((p) => p.base === from && p.quote === to);
  if (hit && hit.rate > 0) return hit.rate;
  const inverse = pairs.find((p) => p.base === to && p.quote === from);
  if (inverse && inverse.rate > 0) return 1 / inverse.rate;
  return null;
}

/** Multiplier converting `from` amounts into `to`; null when no path exists. */
export function fxRate(pairs: readonly FxPair[], from: string, to: string): number | null {
  if (from === to) return 1;
  const straight = direct(pairs, from, to);
  if (straight !== null) return straight;
  // Triangulate via USD (the feed's base currency)
  const toUsd = direct(pairs, from, "USD");
  const fromUsd = direct(pairs, "USD", to);
  if (toUsd !== null && fromUsd !== null) return toUsd * fromUsd;
  return null;
}

export function convertAmount(
  pairs: readonly FxPair[],
  amount: number,
  from: string,
  to: string,
): number | null {
  const rate = fxRate(pairs, from, to);
  return rate === null ? null : amount * rate;
}

/**
 * Listing ids ordered by price compared in one currency (USD). Listings are
 * priced in their own currencies, so ordering the raw numbers would put
 * 1,000 KES ahead of 10 USD. Each price goes through the same conversion as the
 * displayed approximations; one that cannot be converted (no rate on file)
 * sorts last rather than being guessed. Ties fall back to name, then id, so a
 * page boundary never reshuffles between requests.
 */
export function orderByComparablePrice(
  rows: ReadonlyArray<{ id: string; name: string; price: number; currency: string }>,
  pairs: readonly FxPair[],
  direction: "asc" | "desc",
): string[] {
  const keyed = rows.map((r) => ({ ...r, usd: convertAmount(pairs, r.price, r.currency, "USD") }));
  keyed.sort((a, b) => {
    if (a.usd !== b.usd) {
      if (a.usd === null) return 1;
      if (b.usd === null) return -1;
      return direction === "asc" ? a.usd - b.usd : b.usd - a.usd;
    }
    return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });
  return keyed.map((r) => r.id);
}
