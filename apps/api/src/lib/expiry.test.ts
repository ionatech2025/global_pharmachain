import { describe, expect, test } from "bun:test";
import { shouldAlertExpiry } from "./expiry";

const day = (n: number, base = new Date("2026-07-01T00:00:00Z")) =>
  new Date(base.getTime() + n * 24 * 60 * 60 * 1000);

const thresholds = [60, 30, 7];

describe("document expiry alerts (US-104)", () => {
  test("first alert fires when inside the outermost threshold", () => {
    expect(
      shouldAlertExpiry({ expiresAt: day(45), lastAlertAt: null, now: day(0), thresholds }),
    ).toBe(true);
  });

  test("no alert far outside all thresholds", () => {
    expect(
      shouldAlertExpiry({ expiresAt: day(120), lastAlertAt: null, now: day(0), thresholds }),
    ).toBe(false);
  });

  test("does not re-alert within the same threshold window", () => {
    // alerted at 45 days out; next day still within the 60-day window only
    expect(
      shouldAlertExpiry({ expiresAt: day(45), lastAlertAt: day(0), now: day(1), thresholds }),
    ).toBe(false);
  });

  test("re-alerts when crossing the next threshold", () => {
    // alerted at 45 days out; now 25 days out → crossed the 30-day threshold
    expect(
      shouldAlertExpiry({ expiresAt: day(45), lastAlertAt: day(0), now: day(20), thresholds }),
    ).toBe(true);
  });

  test("expired documents are not alerted (they are flagged instead)", () => {
    expect(
      shouldAlertExpiry({ expiresAt: day(-1), lastAlertAt: null, now: day(0), thresholds }),
    ).toBe(false);
  });
});
