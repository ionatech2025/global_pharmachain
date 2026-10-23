/**
 * Which second factor a sign-in must present, decided after the first factor (password or
 * emailed code) succeeded. Pure so the rule is testable and cannot drift between paths.
 *
 *  - Platform admins who have a passkey must use it. TOTP is not accepted in its place: a
 *    one-time code can be phished, and that is the attack a passkey exists to stop.
 *  - Anyone else with a passkey may use it OR a TOTP code, if they also have one.
 *  - TOTP alone behaves as it always has; no factor means none is asked for.
 *
 * Nothing is forced on an account that has not enrolled: enrolment is how a factor
 * becomes required, so no one can be locked out by a release.
 */
export type SecondFactor = "none" | "totp" | "passkey" | "passkey-or-totp";

export function secondFactorFor(args: {
  isSuperAdmin: boolean;
  passkeyCount: number;
  totpEnabled: boolean;
}): SecondFactor {
  if (args.passkeyCount > 0) {
    if (args.isSuperAdmin) return "passkey";
    return args.totpEnabled ? "passkey-or-totp" : "passkey";
  }
  return args.totpEnabled ? "totp" : "none";
}
