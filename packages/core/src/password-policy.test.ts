import { describe, expect, test } from "bun:test";
import {
  normalizePassword,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  passwordLength,
  passwordStructureProblem,
} from "./password-policy";
import { passwordSchema } from "./schemas/auth";

const ok = (p: string) => passwordSchema.safeParse(p).success;
const why = (p: string) => {
  const r = passwordSchema.safeParse(p);
  return r.success ? "" : r.error.issues.map((i) => i.message).join(" | ");
};

describe("NIST SP 800-63B-4 password policy", () => {
  test("the floor is 15 characters for a password that may be the only factor", () => {
    expect(PASSWORD_MIN_LENGTH).toBe(15);
    expect(ok("a1b2c3d4e5f6g7")).toBe(false); // 14
    expect(ok("purple tractor sings")).toBe(true);
  });

  test("a password under the floor is told how long it must be", () => {
    expect(why("short one")).toMatch(/at least 15 characters/i);
  });

  test("accepts at least 64 characters, up to 128", () => {
    expect(PASSWORD_MAX_LENGTH).toBeGreaterThanOrEqual(64);
    expect(ok(`www${"-orbit-".repeat(9)}end`)).toBe(true); // 66
    expect(ok(`${"orbit lamp ".repeat(11)}x`)).toBe(true); // > 100, < 128
    expect(ok("x".repeat(PASSWORD_MAX_LENGTH + 1))).toBe(false);
  });

  test("forbids composition rules: no letter/number/case/symbol is demanded", () => {
    // The old rule demanded a letter AND a number; neither is required now.
    expect(ok("only lowercase words here")).toBe(true);
    expect(ok("739104826519374")).toBe(true); // digits only, 15
    expect(ok("ALL UPPER CASE WORDS")).toBe(true);
  });

  test("spaces and Unicode are welcome, and each code point is one character", () => {
    expect(passwordLength("🔑")).toBe(1); // "🔑".length is 2
    expect(passwordLength("é")).toBe(2);
    expect(ok("пароль для компании 1")).toBe(true);
    // 14 emoji are 28 UTF-16 units but only 14 characters: still under the floor.
    expect(ok("🔑".repeat(14))).toBe(false);
  });

  test("NFC normalisation makes the two spellings of é the same password", () => {
    const composed = "café society rocks";
    const decomposed = "café society rocks";
    expect(composed).not.toBe(decomposed);
    expect(normalizePassword(decomposed)).toBe(composed);
  });
});

describe("structure a blocklist of exact strings cannot catch", () => {
  test("one or two characters repeated", () => {
    expect(passwordStructureProblem("aaaaaaaaaaaaaaaa")).toMatch(/repetitive/i);
    expect(passwordStructureProblem("abababababababab")).toMatch(/repetitive/i);
  });

  test("a short unit repeated end to end", () => {
    expect(passwordStructureProblem("abcabcabcabcabc")).toMatch(/repeated/i);
    expect(passwordStructureProblem("winter-winter-winter-")).toMatch(/repeated/i);
  });

  test("a straight run of letters, digits or keys", () => {
    expect(passwordStructureProblem("abcdefghijklmnopqrstuvwxyz")).toMatch(/straight run/i);
    expect(passwordStructureProblem("1234567890123456")).toBeNull(); // wraps: not a single run
    expect(passwordStructureProblem("qwertyuiop")).toMatch(/straight run/i);
  });

  test("ordinary passphrases are untouched", () => {
    for (const p of ["purple tractor sings", "739104826519374", "Tr0ub4dor&3-horse-staple"]) {
      expect(passwordStructureProblem(p)).toBeNull();
    }
  });

  test("the schema reports the reason, not just 'invalid'", () => {
    expect(why("aaaaaaaaaaaaaaaa")).toMatch(/repetitive/i);
  });
});
