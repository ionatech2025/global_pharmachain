import { describe, expect, test } from "bun:test";
import { INVITE_REJECTION_MESSAGES, INVITE_TTL_MS, inviteRejection } from "./invite-validity";

const usable = { expiresAt: new Date("2026-09-01T12:00:00Z"), revokedAt: null, acceptedAt: null };

describe("inviteRejection", () => {
  test("invitations are valid for 72 hours (US-201)", () => {
    expect(INVITE_TTL_MS).toBe(72 * 60 * 60 * 1000);
  });

  test("a live invitation inside its window is accepted", () => {
    expect(inviteRejection(usable, new Date("2026-08-30T12:00:00Z"))).toBeNull();
  });

  test("the window closes the instant it lapses, not before", () => {
    // Someone clicking on the last second is inside the window, not outside.
    expect(inviteRejection(usable, new Date("2026-09-01T12:00:00.000Z"))).toBeNull();
    expect(inviteRejection(usable, new Date("2026-09-01T12:00:00.001Z"))).toBe("expired");
  });

  test("an expired link is refused as expired, not as a generic dead link", () => {
    // The whole point of the acceptance criterion: the person holding a
    // three-day-old link has to be told *why* it stopped working, or they
    // cannot know that asking for a fresh one is the fix.
    const issued = new Date("2026-08-29T12:00:00Z");
    const invite = {
      expiresAt: new Date(issued.getTime() + INVITE_TTL_MS),
      revokedAt: null,
      acceptedAt: null,
    };
    expect(inviteRejection(invite, new Date(issued.getTime() + INVITE_TTL_MS + 1))).toBe("expired");
    expect(INVITE_REJECTION_MESSAGES.expired).toMatch(/expired/i);
    expect(INVITE_REJECTION_MESSAGES.expired).toMatch(/72 hours/);
  });

  test("revoked, already-used and unknown links are each refused on their own terms", () => {
    const now = new Date("2026-08-30T12:00:00Z");
    expect(inviteRejection({ ...usable, revokedAt: now }, now)).toBe("revoked");
    expect(inviteRejection({ ...usable, acceptedAt: now }, now)).toBe("accepted");
    expect(inviteRejection(null, now)).toBe("unknown");
    // A used invitation points at signing in; a revoked one must not, since
    // there is no account behind it to sign in to.
    expect(INVITE_REJECTION_MESSAGES.accepted).toMatch(/sign in/i);
    expect(INVITE_REJECTION_MESSAGES.revoked).not.toMatch(/sign in/i);
  });

  test("revocation outranks the expiry window in both directions", () => {
    const now = new Date("2026-08-30T12:00:00Z");
    // Still inside the window, but withdrawn.
    expect(inviteRejection({ ...usable, revokedAt: new Date("2026-08-30T11:00:00Z") }, now)).toBe(
      "revoked",
    );
    // Past the window *and* withdrawn: the withdrawal is the honest reason.
    expect(
      inviteRejection(
        { expiresAt: new Date("2026-08-29T12:00:00Z"), revokedAt: now, acceptedAt: null },
        now,
      ),
    ).toBe("revoked");
  });
});
