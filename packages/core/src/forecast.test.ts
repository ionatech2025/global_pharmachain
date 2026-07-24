import { describe, expect, test } from "bun:test";
import { backtestMape, fitTrend, forecast } from "./forecast";

describe("forecasting (Phase 5 §1)", () => {
  test("fits a clean linear trend exactly", () => {
    const { slope, intercept } = fitTrend([2, 4, 6, 8, 10]);
    expect(slope).toBeCloseTo(2, 10);
    expect(intercept).toBeCloseTo(2, 10);
  });

  test("forecast continues an upward trend, damped, floored at zero", () => {
    const up = forecast([10, 20, 30, 40], 2);
    expect(up[0]).toBeGreaterThan(40);
    expect(up[1]).toBeGreaterThan(up[0] as number);
    const down = forecast([30, 20, 10, 0], 3);
    expect(down.every((v) => v >= 0)).toBe(true);
  });

  test("backtest MAPE stays small on perfectly linear history", () => {
    // Damping trades a few points of error on pure trends for stability on
    // noisy real demand — on a clean line it lands under ~12%.
    const mape = backtestMape([5, 10, 15, 20, 25, 30, 35, 40], 3);
    expect(mape).not.toBeNull();
    expect(mape as number).toBeLessThan(12);
  });

  test("backtest declines when history is too short or zero-valued", () => {
    expect(backtestMape([1, 2, 3], 3)).toBeNull();
    expect(backtestMape([0, 0, 0, 0, 0, 0, 0], 3)).toBeNull();
  });
});
