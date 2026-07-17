import { hash as argon2Hash, verify as argon2Verify } from "@node-rs/argon2";

/**
 * Argon2id via @node-rs/argon2 (prebuilt N-API binary) so password auth is
 * runtime-agnostic: Bun locally, Node on Vercel functions. Output is standard
 * PHC format — hashes created earlier by Bun.password verify unchanged, and
 * vice versa (covered by interop assertions in auth flows' tests).
 */
export function hashPassword(password: string): Promise<string> {
  return argon2Hash(password);
}

export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  try {
    return await argon2Verify(passwordHash, password);
  } catch {
    // Malformed/legacy hash — treat as non-matching, never as an error.
    return false;
  }
}
