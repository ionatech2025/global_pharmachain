import { describe, expect, test } from "bun:test";
import { EMAIL_THROTTLE_MS, shouldSendThreadEmail } from "./throttle";

describe("thread email throttle (US-603: max 1 email/thread/10min)", () => {
  const now = new Date("2026-07-08T12:00:00Z");

  test("first message on a thread emails", () => {
    expect(shouldSendThreadEmail(null, now)).toBe(true);
  });

  test("a message inside the window is throttled", () => {
    const last = new Date(now.getTime() - EMAIL_THROTTLE_MS + 1000);
    expect(shouldSendThreadEmail(last, now)).toBe(false);
  });

  test("a message after the window emails again", () => {
    const last = new Date(now.getTime() - EMAIL_THROTTLE_MS);
    expect(shouldSendThreadEmail(last, now)).toBe(true);
  });
});
