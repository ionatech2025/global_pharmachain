import { describe, expect, test } from "bun:test";
import { base32Decode, base32Encode, totpCode, verifyTotp } from "./totp";

// RFC 6238 appendix B (SHA-1): ASCII secret "12345678901234567890".
const RFC_SECRET_B32 = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("base32", () => {
  test("round-trips the RFC secret", () => {
    expect(base32Encode(Buffer.from("12345678901234567890"))).toBe(RFC_SECRET_B32);
    expect(base32Decode(RFC_SECRET_B32).toString()).toBe("12345678901234567890");
  });
});

describe("totp", () => {
  // RFC vectors are 8-digit; our 6-digit codes are the last 6 of each.
  const vectors: Array<[number, string]> = [
    [59_000, "287082"],
    [1_111_111_109_000, "081804"],
    [1_234_567_890_000, "005924"],
    [2_000_000_000_000, "279037"],
  ];
  for (const [timeMs, expected] of vectors) {
    test(`T=${timeMs / 1000}s → ${expected}`, () => {
      expect(totpCode(RFC_SECRET_B32, timeMs)).toBe(expected);
    });
  }

  test("verify accepts ±1 step and rejects beyond", () => {
    const t = 1_234_567_890_000;
    const code = totpCode(RFC_SECRET_B32, t);
    expect(verifyTotp(RFC_SECRET_B32, code, t)).toBe(true);
    expect(verifyTotp(RFC_SECRET_B32, code, t + 30_000)).toBe(true);
    expect(verifyTotp(RFC_SECRET_B32, code, t - 30_000)).toBe(true);
    expect(verifyTotp(RFC_SECRET_B32, code, t + 61_000)).toBe(false);
    expect(verifyTotp(RFC_SECRET_B32, "000000", t)).toBe(false);
    expect(verifyTotp(RFC_SECRET_B32, "28708", t)).toBe(false);
  });
});
