/** A second reset request inside this window issues nothing — stops a known address being mail-bombed. */
export const RESET_COOLDOWN_MS = 60 * 1000;

/**
 * The only thing the forgot-password endpoint ever says. It must read the same
 * for registered and unregistered addresses (account enumeration), yet still
 * answer the question a visitor actually has: whether mail goes to a stranger.
 */
export const FORGOT_PASSWORD_MESSAGE =
  "If an active account exists for that email, a password reset link (valid for 60 minutes) is on its way. No email is sent to addresses that are not registered.";

export function resetCoolingDown(lastIssuedAt: Date | null, now: Date): boolean {
  return lastIssuedAt !== null && now.getTime() - lastIssuedAt.getTime() < RESET_COOLDOWN_MS;
}
