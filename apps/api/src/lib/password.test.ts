import { describe, expect, test } from "bun:test";
import { hash as argon2Hash } from "@node-rs/argon2";
import { hashPassword, verifyPassword } from "./password";
import { isBlockedPassword } from "./password-blocklist";
import { isPwnedPassword, pwnedCheckEnabled } from "./pwned";

describe("blocklist (whole password, never a substring)", () => {
  test("blocks well-known weak passwords of 15+ characters", () => {
    for (const p of ["qwertyuiopasdfghjkl", "passwordpassword", "1234567890123456"]) {
      expect(isBlockedPassword(p)).toBe(true);
    }
  });

  test("ignores case and Unicode composition", () => {
    expect(isBlockedPassword("PasswordPassword")).toBe(true);
  });

  test("a word that merely CONTAINS a blocked one is allowed — NIST forbids substring matching", () => {
    expect(isBlockedPassword("my passwordpassword is long")).toBe(false);
  });

  test("an ordinary passphrase is not blocked", () => {
    expect(isBlockedPassword("purple tractor sings at dawn")).toBe(false);
  });
});

describe("hashing", () => {
  test("round-trips", async () => {
    const h = await hashPassword("purple tractor sings at dawn");
    expect(await verifyPassword("purple tractor sings at dawn", h)).toBe(true);
    expect(await verifyPassword("purple tractor sings at dusk", h)).toBe(false);
  });

  test("the composed and decomposed spellings of the same password are one password", async () => {
    const composed = "café society rocks";
    const decomposed = "café society rocks";
    const h = await hashPassword(decomposed); // stored NFC
    expect(await verifyPassword(composed, h)).toBe(true);
    expect(await verifyPassword(decomposed, h)).toBe(true);
  });

  test("a hash made before normalisation existed (from the raw string) still verifies", async () => {
    const decomposed = "café society rocks";
    const legacy = await argon2Hash(decomposed); // no NFC, as the old code stored it
    expect(await verifyPassword(decomposed, legacy)).toBe(true);
  });

  test("a malformed hash is a non-match, never an exception", async () => {
    expect(await verifyPassword("anything at all here", "not-a-hash")).toBe(false);
  });
});

describe("compromised-password check (Have I Been Pwned range API)", () => {
  // SHA-1("purple tractor sings at dawn") is irrelevant here: the fake returns whatever
  // suffix the test chooses, so the assertions are about the protocol, not a real corpus.
  const sha1 = async (s: string) =>
    [...new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(s)))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();

  test("sends only the 5-character prefix, with padding, and finds a match locally", async () => {
    const pw = "correct horse battery staple";
    const full = await sha1(pw);
    let url = "";
    let headers: Record<string, string> = {};
    const fake = (async (u: string, init: RequestInit) => {
      url = u;
      headers = init.headers as Record<string, string>;
      return new Response(`0000000000000000000000000000000000A:0\n${full.slice(5)}:37\n`);
    }) as unknown as typeof fetch;
    expect(await isPwnedPassword(pw, fake)).toBe(true);
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${full.slice(0, 5)}`);
    expect(url).not.toContain(full.slice(5));
    expect(headers["Add-Padding"]).toBe("true");
  });

  test("a padded zero-count entry is not a match", async () => {
    const pw = "another unrelated passphrase";
    const full = await sha1(pw);
    const fake = (async () => new Response(`${full.slice(5)}:0\n`)) as unknown as typeof fetch;
    expect(await isPwnedPassword(pw, fake)).toBe(false);
  });

  test("fails OPEN: an outage, a bad status or a timeout never blocks the user", async () => {
    const boom = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const five = (async () => new Response("nope", { status: 503 })) as unknown as typeof fetch;
    expect(await isPwnedPassword("whatever passphrase here", boom)).toBe(false);
    expect(await isPwnedPassword("whatever passphrase here", five)).toBe(false);
  });

  test("can be switched off", () => {
    expect(pwnedCheckEnabled({})).toBe(true);
    expect(pwnedCheckEnabled({ PWNED_PASSWORDS_CHECK: "false" })).toBe(false);
  });
});
