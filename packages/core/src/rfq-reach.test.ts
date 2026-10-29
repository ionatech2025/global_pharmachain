import { describe, expect, test } from "bun:test";
import { rfqReachNotices } from "./rfq-reach";

describe("rfqReachNotices: one notice per field", () => {
  test("no verified company of the type: the warning is the type's, and the category says nothing", () => {
    // Client review 2026-10-29: this warning used to sit under "Material category".
    const n = rfqReachNotices({ ofType: 0, inCategory: 0 }, "Laboratory Chemicals");
    expect(n.type.tone).toBe("warning");
    expect(n.type.text).toContain("No verified company of this type");
    expect(n.category).toBeNull();
    expect(rfqReachNotices({ ofType: 0, inCategory: null }).category).toBeNull();
  });

  test("the type notice counts the type, singular and plural", () => {
    expect(rfqReachNotices({ ofType: 1, inCategory: null }).type).toEqual({
      tone: "info",
      text: "1 verified company of this type.",
    });
    expect(rfqReachNotices({ ofType: 3, inCategory: null }).type.text).toBe(
      "3 verified companies of this type.",
    );
  });

  test("any category reaches the whole type", () => {
    expect(rfqReachNotices({ ofType: 3, inCategory: null }).category).toEqual({
      tone: "info",
      text: "Any category: all 3 of them will see it.",
    });
  });

  test("a category nobody lists is a warning on the category, not a quiet zero", () => {
    const n = rfqReachNotices({ ofType: 3, inCategory: 0 }, "Packaging Materials");
    expect(n.type.tone).toBe("info");
    expect(n.category?.tone).toBe("warning");
    expect(n.category?.text).toContain("nobody would see this RFQ");
    expect(n.category?.text).toContain("Packaging Materials");
  });

  test("a category that narrows reach says by how much", () => {
    const n = rfqReachNotices({ ofType: 3, inCategory: 1 }, "APIs");
    expect(n.category?.tone).toBe("narrowed");
    expect(n.category?.text).toBe(
      "Only the 1 of 3 that list APIs will see it. Choose Any category to reach all 3.",
    );
  });

  test("a category everyone lists costs nothing", () => {
    const n = rfqReachNotices({ ofType: 2, inCategory: 2 }, "APIs");
    expect(n.category?.tone).toBe("info");
    expect(n.category?.text).toContain("costs no reach");
  });
});
