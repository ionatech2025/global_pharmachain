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
