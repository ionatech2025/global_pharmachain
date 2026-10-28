import { describe, expect, test } from "bun:test";
import { VERIFICATION_STATUSES, verificationStatusLabel } from "./enums";

describe("verification status words (client review, 2026-10-27)", () => {
  test("a renewal back in the queue reads as awaiting re-approval", () => {
    expect(verificationStatusLabel("PENDING_VERIFICATION", true)).toBe("Awaiting re-approval");
  });

  test("a first review still reads as pending verification", () => {
    expect(verificationStatusLabel("PENDING_VERIFICATION", false)).toBe("Pending verification");
    expect(verificationStatusLabel("PENDING_VERIFICATION")).toBe("Pending verification");
  });

  test("history changes no other status", () => {
    for (const status of VERIFICATION_STATUSES) {
      if (status === "PENDING_VERIFICATION") continue;
      expect(verificationStatusLabel(status, true)).toBe(verificationStatusLabel(status, false));
    }
    expect(verificationStatusLabel("EXPIRED_DOCUMENT", true)).toBe("Document expired");
  });
});
