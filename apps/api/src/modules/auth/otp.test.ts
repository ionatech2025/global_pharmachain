import { describe, expect, test } from "bun:test";
import { generateOtpCode, hashOtp, hashToken, randomToken } from "../../lib/crypto";

describe("otp/token primitives", () => {
  test("otp codes are 6 digits", () => {
    for (let i = 0; i < 20; i++) {
      expect(generateOtpCode()).toMatch(/^\d{6}$/);
    }
  });

  test("otp hash binds code, email and server secret", () => {
    const h = hashOtp("123456", "User@Example.com", "secret");
    expect(h).toBe(hashOtp("123456", "user@example.com", "secret")); // email normalized
    expect(h).not.toBe(hashOtp("123457", "user@example.com", "secret"));
    expect(h).not.toBe(hashOtp("123456", "other@example.com", "secret"));
    expect(h).not.toBe(hashOtp("123456", "user@example.com", "other-secret"));
  });

  test("tokens are url-safe and hash deterministically", () => {
    const token = randomToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toBe(hashToken(randomToken()));
  });
});
