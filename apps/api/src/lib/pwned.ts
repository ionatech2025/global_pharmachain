import { createHash } from "node:crypto";
import { logger } from "./logger";

/**
 * Have I Been Pwned "Pwned Passwords" range query — k-anonymity: only the first five hex
 * characters of the SHA-1 leave the server, and the match happens here. `Add-Padding`
 * hides how many suffixes really matched.
 *
 * Fails OPEN. An outage, a slow reply or a bad response must never stop a user from
 * setting a password (the local blocklist and the length floor still apply), and the cost
 * is capped at TIMEOUT_MS. Callers run it beside the Argon2 hash, so it adds latency only
 * when it is slower than the hash.
 */
const TIMEOUT_MS = 1500;

export function pwnedCheckEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.PWNED_PASSWORDS_CHECK !== "false";
}

export async function isPwnedPassword(
  password: string,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean> {
  const sha1 = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  try {
    const res = await fetchImpl(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true", "User-Agent": "global-pharmachain-password-check" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return false;
    const text = await res.text();
    for (const line of text.split("\n")) {
      const [candidate, count] = line.trim().split(":");
      if (candidate === suffix) return Number(count) > 0;
    }
    return false;
  } catch (err) {
    logger.warn("pwned-passwords check unavailable; continuing without it", { error: String(err) });
    return false;
  }
}
