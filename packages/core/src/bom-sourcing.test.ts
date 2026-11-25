import { describe, expect, test } from "bun:test";
import { bomSourcing, openRfqsWithoutLine } from "./bom-sourcing";

const DAY1 = "2026-11-01T00:00:00.000Z";
const DAY2 = "2026-11-02T00:00:00.000Z";
const DAY3 = "2026-11-03T00:00:00.000Z";

const rfq = (refNo: string, status: string, awardedAt: string | null = null) => ({
  id: refNo,
  refNo,
  status,
  awardedAt,
});
const line = (materialName: string, ...rfqs: ReturnType<typeof rfq>[]) => ({
  materialName,
  rfqs,
});

// Version 2 (newest first, as the API lists them) keeps Item 1 and drops Item 2.
const kept = line("Item 1");
const v2 = { createdAt: DAY2, items: [kept] };
const v1 = {
  createdAt: DAY1,
  items: [line("Item 1", rfq("RFQ-A", "OPEN")), line("Item 2", rfq("RFQ-B", "OPEN"))],
};

describe("bomSourcing: which RFQ covers a line", () => {
  test("a kept line shows the open RFQ raised from the earlier version", () => {
    expect(bomSourcing([v2, v1])(kept, v2)).toEqual({
      rfq: rfq("RFQ-A", "OPEN"),
      sourced: false,
    });
  });

  test("materials match regardless of case and spacing", () => {
    expect(bomSourcing([v2, v1])(line("  item   1 "), v2)?.rfq.refNo).toBe("RFQ-A");
  });

  test("the line's own RFQ beats an earlier version's", () => {
    const own = line("Item 1", rfq("RFQ-NEW", "OPEN"));
    const v = { createdAt: DAY2, items: [own] };
    expect(bomSourcing([v, v1])(own, v)?.rfq.refNo).toBe("RFQ-NEW");
  });

  test("a carried RFQ awarded after the version was created keeps the line sourced", () => {
    const old = { createdAt: DAY1, items: [line("Item 1", rfq("RFQ-A", "AWARDED", DAY3))] };
    expect(bomSourcing([v2, old])(kept, v2)).toEqual({
      rfq: rfq("RFQ-A", "AWARDED", DAY3),
      sourced: true,
    });
  });

  test("an award made before the version was created does not carry, nor hide its new RFQ", () => {
    const awarded = line("Lactose", rfq("RFQ-OLD", "AWARDED", DAY1));
    const old = { createdAt: DAY1, items: [awarded] };
    const fresh = line("Lactose");
    const later = { createdAt: DAY2, items: [fresh] };
    expect(bomSourcing([later, old])(fresh, later)).toBeNull();
    const reordered = line("Lactose", rfq("RFQ-NEW", "OPEN"));
    const withOwn = { createdAt: DAY2, items: [reordered] };
    expect(bomSourcing([withOwn, old])(reordered, withOwn)).toEqual({
      rfq: rfq("RFQ-NEW", "OPEN"),
      sourced: false,
    });
    expect(bomSourcing([old])(awarded, old)).toEqual({
      rfq: rfq("RFQ-OLD", "AWARDED", DAY1),
      sourced: true,
    });
  });

  test("on its own line, an awarded RFQ beats an open one; cancelled and closed free the line", () => {
    const sourcingOf = bomSourcing([]);
    const v = { createdAt: DAY1 };
    expect(sourcingOf(line("API", rfq("RFQ-O", "OPEN"), rfq("RFQ-W", "AWARDED", DAY2)), v)).toEqual(
      { rfq: rfq("RFQ-W", "AWARDED", DAY2), sourced: true },
    );
    expect(
      sourcingOf(line("Solvent", rfq("RFQ-X", "CANCELLED"), rfq("RFQ-C", "CLOSED")), v),
    ).toBeNull();
  });
});

describe("openRfqsWithoutLine: what activating a version leaves behind", () => {
  test("names the open RFQ of the dropped line, not the kept one", () => {
    expect(openRfqsWithoutLine([v2, v1], v2)).toEqual([
      { materialName: "Item 2", rfq: rfq("RFQ-B", "OPEN") },
    ]);
  });

  test("a version that keeps every line leaves nothing behind", () => {
    expect(openRfqsWithoutLine([v2, v1], v1)).toEqual([]);
  });

  test("only open RFQs count: an awarded or cancelled one is no longer waiting on suppliers", () => {
    const old = {
      items: [line("Gone", rfq("RFQ-W", "AWARDED", DAY1), rfq("RFQ-X", "CANCELLED"))],
    };
    expect(openRfqsWithoutLine([v2, old], v2)).toEqual([]);
  });
});
