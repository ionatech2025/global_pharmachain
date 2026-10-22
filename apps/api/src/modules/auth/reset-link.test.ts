import { describe, expect, test } from "bun:test";
import { FORGOT_PASSWORD_MESSAGE, RESET_COOLDOWN_MS, resetCoolingDown } from "./reset-link";

describe("resetCoolingDown", () => {
  const now = new Date("2026-10-22T10:00:00Z");

  test("no earlier request: never cooling down", () => {
    expect(resetCoolingDown(null, now)).toBe(false);
  });

  test("a request inside the window is absorbed", () => {
    expect(resetCoolingDown(new Date(now.getTime() - RESET_COOLDOWN_MS + 1), now)).toBe(true);
    expect(resetCoolingDown(new Date(now.getTime() - 5_000), now)).toBe(true);
  });

  test("at and after the window it issues again", () => {
    expect(resetCoolingDown(new Date(now.getTime() - RESET_COOLDOWN_MS), now)).toBe(false);
    expect(resetCoolingDown(new Date(now.getTime() - 10 * 60_000), now)).toBe(false);
  });
});

describe("FORGOT_PASSWORD_MESSAGE", () => {
  test("is conditional on an account existing, and says unregistered addresses get no mail", () => {
    expect(FORGOT_PASSWORD_MESSAGE).toMatch(/^If an active account exists/);
    expect(FORGOT_PASSWORD_MESSAGE).toMatch(
      /No email is sent to addresses that are not registered/,
    );
  });
});
