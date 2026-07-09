export function fmtMoney(amount: string | number, currency: string): string {
  const value = typeof amount === "string" ? Number.parseFloat(amount) : amount;
  if (!Number.isFinite(value)) return `${amount} ${currency}`;
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    currencyDisplay: "code",
    maximumFractionDigits: 2,
  }).format(value);
}

export interface DisplayRate {
  base: string;
  quote: string;
  rate: string | number;
}

/** Indicative alternate-currency conversions for a base price (US-302) —
 *  display-only, using admin-managed rates (no live FX in the MVP). */
export function convertedPrices(
  amount: string | number,
  currency: string,
  rates: DisplayRate[],
): string[] {
  const value = typeof amount === "string" ? Number.parseFloat(amount) : amount;
  if (!Number.isFinite(value)) return [];
  return rates
    .filter((r) => r.base === currency)
    .map((r) => {
      const rate = typeof r.rate === "string" ? Number.parseFloat(r.rate) : r.rate;
      return Number.isFinite(rate) ? fmtMoney(value * rate, r.quote) : null;
    })
    .filter((v): v is string => v !== null);
}

export function fmtNumber(value: string | number): string {
  const n = typeof value === "string" ? Number.parseFloat(value) : value;
  return Number.isFinite(n) ? new Intl.NumberFormat("en").format(n) : String(value);
}

export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(value));
}

export function fmtDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

export function timeAgo(value: string | Date): string {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return fmtDate(value);
}
