import { describe, expect, test } from "bun:test";
import { evaluateUsage, startOfUtcMonth } from "./billing";

describe("freemium usage (US-906/907)", () => {
  test("premium and featured tiers are unlimited", () => {
    const res = evaluateUsage({ tier: "PREMIUM", baseLimit: 5, confirmedCredits: 0, used: 999 });
    expect(res.blocked).toBe(false);
    expect(res.limit).toBeNull();
  });

  test("freemium blocks at the effective limit", () => {
    const res = evaluateUsage({ tier: "FREEMIUM", baseLimit: 5, confirmedCredits: 0, used: 5 });
    expect(res.blocked).toBe(true);
    expect(res.remaining).toBe(0);
  });

  test("confirmed credits raise the effective limit", () => {
    const res = evaluateUsage({ tier: "FREEMIUM", baseLimit: 5, confirmedCredits: 3, used: 5 });
    expect(res.blocked).toBe(false);
    expect(res.limit).toBe(8);
    expect(res.remaining).toBe(3);
  });

  test("80% warning fires exactly on the crossing action", () => {
    // limit 10 → warn threshold ceil(8) = 8: the action taking usage from 7 to 8 warns
    const before = evaluateUsage({ tier: "FREEMIUM", baseLimit: 10, confirmedCredits: 0, used: 6 });
    const crossing = evaluateUsage({
      tier: "FREEMIUM",
      baseLimit: 10,
      confirmedCredits: 0,
      used: 7,
    });
    const after = evaluateUsage({ tier: "FREEMIUM", baseLimit: 10, confirmedCredits: 0, used: 8 });
    expect(before.crossesWarnThreshold).toBe(false);
    expect(crossing.crossesWarnThreshold).toBe(true);
    expect(after.crossesWarnThreshold).toBe(false);
  });

  test("startOfUtcMonth truncates correctly", () => {
    const d = startOfUtcMonth(new Date("2026-07-08T15:45:00Z"));
    expect(d.toISOString()).toBe("2026-07-01T00:00:00.000Z");
  });
});
