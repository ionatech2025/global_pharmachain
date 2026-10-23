import { hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";
import { normalizePassword } from "@pharmachain/core";

/**
 * Argon2id via @node-rs/argon2 (prebuilt N-API binary) so password auth is
 * runtime-agnostic: Bun locally, Node on Vercel functions. Output is standard
 * PHC format — hashes created earlier by Bun.password verify unchanged, and
 * vice versa (covered by interop assertions in auth flows' tests).
 *
 * Passwords are NFC-normalised before hashing (NIST SP 800-63B-4: so "é" typed as one
 * code point or as "e" + a combining accent is the same password on every device).
 */
export function hashPassword(password: string): Promise<string> {
  return argon2Hash(normalizePassword(password));
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  try {
    // As typed first: hashes made before normalisation was introduced were made from the
    // raw string, and for ASCII (nearly every password) the two are identical, so this is
    // a single verification. Only a non-ASCII password that normalisation changes pays for
    // a second.
    if (await argon2Verify(passwordHash, password)) return true;
    const normalized = normalizePassword(password);
    return normalized !== password && (await argon2Verify(passwordHash, normalized));
  } catch {
    // Malformed/legacy hash — treat as non-matching, never as an error.
    return false;
  }
}
