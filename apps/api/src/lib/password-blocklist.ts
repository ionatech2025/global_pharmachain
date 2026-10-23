import { normalizePassword } from "@pharmachain/core";
import { BLOCKLIST_SOURCE } from "./password-blocklist.data";

let blocked: Set<string> | null = null;

/** Built on first use: ~16k short strings, a millisecond or so, once per instance. */
function blocklist(): Set<string> {
  blocked ??= new Set(BLOCKLIST_SOURCE.split("\n").filter(Boolean));
  return blocked;
}

/** The whole password, compared case-insensitively after NFC (never a substring). */
export function isBlockedPassword(password: string): boolean {
  return blocklist().has(normalizePassword(password).toLowerCase());
}
