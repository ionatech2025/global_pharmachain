import { describe, expect, test } from "bun:test";
import {
  companyTypesMatching,
  subscriptionTiersMatching,
  VERIFICATION_STATUSES,
  verificationStatusLabel,
} from "./enums";

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

describe("admin company search matches types and tiers (client review, 2026-10-29)", () => {
  test("a word in the Type column finds every type that shows it", () => {
    const types = companyTypesMatching("supplier");
    expect(types).toContain("SUPPLIER");
    expect(types).toContain("LABORATORY_CONSUMABLES_SUPPLIER");
    expect(types).not.toContain("RAW_MATERIAL_MANUFACTURER");
  });

  test("the label the admin reads matches, case-insensitively", () => {
    expect(companyTypesMatching("Wholesale Pharmacy")).toEqual(["WHOLESALE_PHARMACY"]);
    expect(companyTypesMatching("raw material")).toEqual(["RAW_MATERIAL_MANUFACTURER"]);
  });

  test("tiers match by name", () => {
    expect(subscriptionTiersMatching("premium")).toEqual(["PREMIUM"]);
    expect(subscriptionTiersMatching("FREE")).toEqual(["FREEMIUM"]);
  });

  test("one character selects nothing", () => {
    expect(companyTypesMatching("s")).toEqual([]);
    expect(subscriptionTiersMatching("p")).toEqual([]);
  });
});
