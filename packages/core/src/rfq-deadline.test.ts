import { describe, expect, test } from "bun:test";
import { effectiveRfqStatus, formatNoticeTime } from "./rfq-deadline";
import { rfqAmendSchema } from "./schemas/rfq";

describe("deadlines state a date, a time and a zone (UNCITRAL art. 30(1))", () => {
  test("the old 23:59 UTC deadline reads as the next morning in Kampala, and says so", () => {
    // What a buyer picking "5 November" used to store.
    const text = formatNoticeTime(new Date("2026-11-05T23:59:00Z"));
    expect(text).toContain("6 Nov 2026");
    expect(text).toContain("02:59");
    expect(text).toContain("(23:59 UTC)");
  });

  test("a deadline set at 23:59 Kampala time reads as the day the buyer chose", () => {
    const text = formatNoticeTime(new Date("2026-11-05T20:59:00Z"));
    expect(text).toMatch(/^5 Nov 2026, 23:59 GMT\+3 \(20:59 UTC\)$/);
  });

  test("another zone can be asked for", () => {
    expect(formatNoticeTime(new Date("2026-11-05T20:59:00Z"), "UTC")).toMatch(/20:59 UTC$/);
  });
});

describe("effective status: past its deadline an RFQ is closed, whether or not the job ran", () => {
  const now = new Date("2026-11-05T12:00:00Z");
  test("an OPEN row past its deadline reads CLOSED", () => {
    expect(effectiveRfqStatus("OPEN", new Date("2026-11-05T11:59:59Z"), now)).toBe("CLOSED");
  });
  test("an OPEN row before its deadline stays OPEN", () => {
    expect(effectiveRfqStatus("OPEN", new Date("2026-11-05T12:00:01Z"), now)).toBe("OPEN");
  });
  test("no other status is rewritten", () => {
    const past = new Date("2026-01-01T00:00:00Z");
    for (const status of ["CLOSED", "AWARDED", "CANCELLED"] as const) {
      expect(effectiveRfqStatus(status, past, now)).toBe(status);
    }
  });
});

describe("amendments", () => {
  test("need a real note", () => {
    expect(rfqAmendSchema.safeParse({ note: "too short" }).success).toBe(false);
    expect(rfqAmendSchema.safeParse({ note: "Delivery is now CIF Entebbe." }).success).toBe(true);
  });
  test("a new deadline must be in the future", () => {
    const note = "Delivery is now CIF Entebbe.";
    expect(
      rfqAmendSchema.safeParse({ note, newDeadline: "2020-01-01T00:00:00.000Z" }).success,
    ).toBe(false);
    const later = new Date(Date.now() + 864e5).toISOString();
    expect(rfqAmendSchema.safeParse({ note, newDeadline: later }).success).toBe(true);
  });
});
