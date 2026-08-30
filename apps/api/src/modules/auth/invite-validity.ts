/**
 * Whether an invitation link may still be accepted, and what to say when it
 * may not.
 *
 * Deliberately free of imports: the accept handler reaches the database and
 * the app's environment, but this rule is pure policy, so the 72-hour
 * boundary can be tested at an exact instant instead of by waiting three
 * days — which is why US-201's "link rejected with expiry message" case had
 * never actually been confirmed.
 */

export const INVITE_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours (US-201)

/** Why an invitation cannot be accepted, or null when it can. */
export type InviteRejection = "unknown" | "revoked" | "accepted" | "expired";

export interface InviteValidity {
  expiresAt: Date;
  revokedAt: Date | null;
  acceptedAt: Date | null;
}

export function inviteRejection(
  invite: InviteValidity | null | undefined,
  now: Date = new Date(),
): InviteRejection | null {
  if (!invite) return "unknown";
  if (invite.revokedAt) return "revoked";
  if (invite.acceptedAt) return "accepted";
  // Exactly at expiry the link is still good; a millisecond past it is not.
  if (invite.expiresAt.getTime() < now.getTime()) return "expired";
  return null;
}

/**
 * US-201 asks an expired link to be refused *with an expiry message*, which
 * only holds if "expired" stays distinguishable from every other dead link —
 * a revoked one, an already-used one, a token that never existed. Each says
 * what to do next, since the person holding the link cannot see why it broke.
 */
export const INVITE_REJECTION_MESSAGES: Record<InviteRejection, string> = {
  unknown: "This invitation is no longer valid — ask your Company Admin for a new one",
  revoked: "This invitation was withdrawn — ask your Company Admin for a new one",
  accepted: "This invitation has already been used — sign in instead",
  expired: "This invitation has expired — invitation links are valid for 72 hours",
};
