// Token/OTP primitives. Values sent to users are never stored — only their
// SHA-256 digests, so a database leak exposes no usable secrets.
// node:crypto (not Bun.CryptoHasher) so the API runs on Bun AND Node —
// Vercel functions execute this code on the Node runtime.
import { createHash } from "node:crypto";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** URL-safe random token (default 32 bytes ≈ 43 chars base64url). */
export function randomToken(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Buffer.from(buf).toString("base64url");
}

export function generateOtpCode(): string {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const n = buf[0] ?? 0;
  return String(n % 1_000_000).padStart(6, "0");
}

/** OTP digests are peppered with the server secret and bound to the email. */
export function hashOtp(code: string, email: string, secret: string): string {
  return sha256Hex(`${code}:${email.toLowerCase()}:${secret}`);
}

export function hashToken(token: string): string {
  return sha256Hex(token);
}
