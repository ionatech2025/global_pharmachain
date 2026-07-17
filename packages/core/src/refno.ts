// Human-readable unique references (RFQ-2026-8F3K2AQ9). Uniqueness is
// enforced by a unique column; 8 random base32 chars ≈ 1.1e12 combinations
// per prefix-year keeps the collision probability negligible even at
// millions of rows (a collision surfaces as a mapped 409, not a 500).
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32 — no I/L/O/U

export function generateRefNo(prefix: string, now = new Date()): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  let suffix = "";
  for (const b of bytes) suffix += ALPHABET[b % ALPHABET.length];
  return `${prefix}-${now.getUTCFullYear()}-${suffix}`;
}
