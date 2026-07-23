import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * RFC 6238 TOTP (SHA-1, 30 s step, 6 digits) — the profile every
 * authenticator app speaks. Implemented directly on node:crypto: ~40 lines
 * beats a dependency for something this stable, and the RFC test vectors
 * below (totp.test.ts) pin the behavior.
 */

const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const TOTP_STEP_SECONDS = 30;
const DIGITS = 6;

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    value = (value << 5) | B32_ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function hotp(key: Buffer, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", key).update(msg).digest();
  const offset = (digest[digest.length - 1] as number) & 0x0f;
  const code =
    (((digest[offset] as number) & 0x7f) << 24) |
    (((digest[offset + 1] as number) & 0xff) << 16) |
    (((digest[offset + 2] as number) & 0xff) << 8) |
    ((digest[offset + 3] as number) & 0xff);
  return String(code % 10 ** DIGITS).padStart(DIGITS, "0");
}

export function totpCode(secret: string, timeMs: number, stepSeconds = TOTP_STEP_SECONDS): string {
  const counter = Math.floor(timeMs / 1000 / stepSeconds);
  return hotp(base32Decode(secret), counter);
}

/** Accepts the current step ±1 to absorb clock drift; constant-time compare. */
export function verifyTotp(secret: string, code: string, timeMs = Date.now()): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const given = Buffer.from(code);
  for (const drift of [0, -1, 1]) {
    const expected = Buffer.from(totpCode(secret, timeMs + drift * TOTP_STEP_SECONDS * 1000));
    if (given.length === expected.length && timingSafeEqual(given, expected)) return true;
  }
  return false;
}

export function otpauthUri(secret: string, email: string): string {
  const label = encodeURIComponent(`PharmaChain:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=PharmaChain&algorithm=SHA1&digits=${DIGITS}&period=${TOTP_STEP_SECONDS}`;
}
