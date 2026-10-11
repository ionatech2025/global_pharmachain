import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Encryption at rest for secrets the platform must be able to read back —
 * TOTP seeds (to verify codes) and webhook signing secrets (to sign). They
 * cannot be hashed like passwords, and stored in clear they ride along in
 * every database backup: whoever holds a dump holds every second factor.
 *
 * AES-256-GCM (authenticated: a tampered value fails to open rather than
 * decrypting to garbage). The key is derived from AUTH_SECRET with HKDF under
 * its own label, so it is never the session key itself. Values carry a
 * versioned prefix; anything without one is a legacy plaintext value and is
 * returned as-is, so existing rows keep working until they are next written.
 *
 * Rotating AUTH_SECRET makes `enc:v1:` values unreadable (users re-enrol
 * TOTP, webhooks are re-created). A future dedicated key gets a new prefix.
 */
const PREFIX = "enc:v1:";

function keyFor(secret: string): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, "pharmachain", "secret-box/v1", 32));
}

function key(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required to seal secrets at rest");
  return keyFor(secret);
}

export function isSealed(stored: string): boolean {
  return stored.startsWith(PREFIX);
}

export function sealSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return `${PREFIX}${Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString("base64url")}`;
}

/** Opens a sealed value; a legacy plaintext value is returned unchanged. */
export function openSecret(stored: string): string {
  if (!isSealed(stored)) return stored;
  const raw = Buffer.from(stored.slice(PREFIX.length), "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key(), raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
}
