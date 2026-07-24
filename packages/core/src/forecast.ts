/**
 * Deterministic forecasting for demand/price intelligence (Phase 5 §1):
 * ordinary-least-squares trend with damping, plus an honest backtest — the
 * reported accuracy is the mean absolute percentage error of forecasting the
 * last k observed points from the points before them. Transparent statistics
 * beat an opaque model for auditability; the eval (MAPE) ships with every
 * forecast so consumers see exactly how trustworthy it is.
 */

export interface TrendFit {
  slope: number;
  intercept: number;
}

export function fitTrend(series: readonly number[]): TrendFit {
  const n = series.length;
  if (n === 0) return { slope: 0, intercept: 0 };
  if (n === 1) return { slope: 0, intercept: series[0] as number };
  const meanX = (n - 1) / 2;
  const meanY = series.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i += 1) {
    num += (i - meanX) * ((series[i] as number) - meanY);
    den += (i - meanX) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  return { slope, intercept: meanY - slope * meanX };
}

/** Forecast `horizon` future points; trend damped toward flat and floored at 0. */
export function forecast(series: readonly number[], horizon: number, damping = 0.85): number[] {
  const { slope, intercept } = fitTrend(series);
  const n = series.length;
  const out: number[] = [];
  let effectiveSlope = slope;
  for (let h = 1; h <= horizon; h += 1) {
    effectiveSlope *= damping;
    out.push(Math.max(0, intercept + slope * (n - 1) + effectiveSlope * h));
  }
  return out;
}

/** Backtest MAPE (%) over the last k points; null when history is too short
 *  or the held-out actuals are all zero (MAPE undefined). */
export function backtestMape(series: readonly number[], k = 3): number | null {
  if (series.length < k + 3) return null;
  const train = series.slice(0, series.length - k);
  const actual = series.slice(series.length - k);
  const predicted = forecast(train, k);
  const terms: number[] = [];
  for (let i = 0; i < k; i += 1) {
    const a = actual[i] as number;
    if (a === 0) continue;
    terms.push(Math.abs(((predicted[i] as number) - a) / a));
  }
  if (terms.length === 0) return null;
  return (terms.reduce((s, v) => s + v, 0) / terms.length) * 100;
}
