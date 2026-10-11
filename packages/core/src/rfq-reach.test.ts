import { describe, expect, test } from "bun:test";
import { rfqReachNotice } from "./rfq-reach";

describe("rfqReachNotice", () => {
  test("any category reaches the whole type", () => {
    expect(rfqReachNotice({ ofType: 3, inCategory: null })).toEqual({
      tone: "info",
      text: "Any category: all 3 verified companies of this type will see it.",
    });
    expect(rfqReachNotice({ ofType: 1, inCategory: null }).text).toContain("1 verified company ");
  });

  test("a category nobody lists is a warning, not a quiet zero", () => {
    const notice = rfqReachNotice({ ofType: 3, inCategory: 0 }, "Packaging Materials");
    expect(notice.tone).toBe("warning");
    expect(notice.text).toContain("nobody would see this RFQ");
    expect(notice.text).toContain("reach all 3");
  });

  test("a category that narrows reach says by how much", () => {
    const notice = rfqReachNotice({ ofType: 3, inCategory: 1 }, "Excipients");
    expect(notice.tone).toBe("narrowed");
    expect(notice.text).toBe(
      "Only the 1 of 3 that list Excipients will see it. Choose Any category to reach all 3.",
    );
  });

  test("a category everyone lists costs nothing", () => {
    const notice = rfqReachNotice({ ofType: 2, inCategory: 2 }, "APIs");
    expect(notice.tone).toBe("info");
    expect(notice.text).toContain("costs no reach");
  });

  test("no verified company of the type at all", () => {
    expect(rfqReachNotice({ ofType: 0, inCategory: 0 }, "APIs").tone).toBe("warning");
    expect(rfqReachNotice({ ofType: 0, inCategory: null }).text).toContain("nobody");
  });
});
