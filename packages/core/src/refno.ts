// Human-readable unique references (RFQ-2026-8F3K2A). Uniqueness is enforced
// by a unique column; callers retry on the (vanishingly rare) collision.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32 — no I/L/O/U

export function generateRefNo(prefix: string, now = new Date()): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  let suffix = "";
  for (const b of bytes) suffix += ALPHABET[b % ALPHABET.length];
  return `${prefix}-${now.getUTCFullYear()}-${suffix}`;
}
