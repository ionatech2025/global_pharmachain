const DAY_MS = 24 * 60 * 60 * 1000;

export function daysUntil(date: Date, now: Date): number {
  return Math.ceil((date.getTime() - now.getTime()) / DAY_MS);
}

/**
 * Threshold-crossing alert decision (US-104): alert when the days-remaining
 * has crossed a configured threshold that the previous alert (if any) had not
 * yet crossed. Re-running the daily job never double-alerts.
 */
export function shouldAlertExpiry(args: {
  expiresAt: Date;
  lastAlertAt: Date | null;
  now: Date;
  thresholds: number[]; // e.g. [60, 30, 7]
}): boolean {
  const { expiresAt, lastAlertAt, now, thresholds } = args;
  const daysLeft = daysUntil(expiresAt, now);
  if (daysLeft < 0) return false; // expired documents are flagged, not alerted
  const prevDaysLeft = lastAlertAt ? daysUntil(expiresAt, lastAlertAt) : Number.POSITIVE_INFINITY;
  return thresholds.some((t) => daysLeft <= t && prevDaysLeft > t);
}
