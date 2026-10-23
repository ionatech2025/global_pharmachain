/**
 * Password policy — NIST SP 800-63B-4 §3.1.1.2 (read from the standard itself, not a
 * summary of it):
 *
 *  - a password that is the only factor must be at least 15 characters (8 is the floor
 *    only where it is one part of multi-factor authentication; accounts here may have
 *    no second factor, so 15 applies to everyone);
 *  - a verifier should accept at least 64 characters — 128 here;
 *  - NO composition rules (no "one letter and one number"): they are forbidden;
 *  - each Unicode code point counts as one character, not a UTF-16 unit;
 *  - spaces and non-ASCII are welcome, and NFC normalisation is applied before hashing;
 *  - the whole password is compared with a blocklist of common and compromised values
 *    (server side), and a rejected password is told why;
 *  - no periodic rotation, and paste / password managers are never blocked.
 */
export const PASSWORD_MIN_LENGTH = 15;
export const PASSWORD_MAX_LENGTH = 128;

export const PASSWORD_HINT =
  "At least 15 characters. A few unrelated words make a strong, memorable passphrase — spaces are fine.";

/** Length in Unicode code points, as the standard counts it ("🔑" is one, not two). */
export function passwordLength(password: string): number {
  return Array.from(password).length;
}

/** NFC, applied before hashing and again before verifying. */
export function normalizePassword(password: string): string {
  return password.normalize("NFC");
}

/**
 * Obvious structure a blocklist of exact strings cannot catch: one character repeated,
 * a short unit repeated end to end, or a straight run along the alphabet, the digits or
 * a keyboard row. Returns the reason to show, or null. Deliberately not a character-type
 * rule — a long passphrase in lowercase letters passes.
 */
export function passwordStructureProblem(password: string): string | null {
  const chars = Array.from(password.normalize("NFC").toLowerCase());
  if (chars.length === 0) return null;
  if (new Set(chars).size <= 2)
    return "Too repetitive — use several different words or characters.";
  const s = chars.join("");
  for (let unit = 1; unit <= Math.floor(s.length / 3); unit += 1) {
    if (s.length % unit === 0 && s === s.slice(0, unit).repeat(s.length / unit)) {
      return "That is one short pattern repeated — use something less predictable.";
    }
  }
  const runs = ["abcdefghijklmnopqrstuvwxyz", "0123456789", "qwertyuiop", "asdfghjkl", "zxcvbnm"];
  for (const run of runs) {
    const both = [run, [...run].reverse().join("")];
    if (both.some((r) => r.includes(s) && s.length >= 6)) {
      return "That is a straight run of keys or letters — easy to guess.";
    }
  }
  return null;
}
