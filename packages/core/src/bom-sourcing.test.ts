import { describe, expect, test } from "bun:test";
import { bomSourcing, openRfqsWithoutLine } from "./bom-sourcing";

const rfq = (refNo: string, status: string) => ({ id: refNo, refNo, status });
const line = (materialName: string, ...rfqs: ReturnType<typeof rfq>[]) => ({
  materialName,
  rfqs,
});

// Version 2 (newest first, as the API lists them) keeps Item 1 and drops Item 2.
const kept = line("Item 1");
const v2 = { items: [kept] };
const v1 = {
  items: [line("Item 1", rfq("RFQ-A", "OPEN")), line("Item 2", rfq("RFQ-B", "OPEN"))],
};

describe("bomSourcing: which RFQ covers a line", () => {
  test("a kept line shows the open RFQ raised from the earlier version", () => {
    const sourcingOf = bomSourcing([v2, v1]);
    expect(sourcingOf(kept)).toEqual({ rfq: rfq("RFQ-A", "OPEN"), sourced: false });
  });

  test("materials match regardless of case and spacing", () => {
    expect(bomSourcing([v2, v1])(line("  item   1 "))?.rfq.refNo).toBe("RFQ-A");
  });

  test("the line's own RFQ beats an earlier version's", () => {
    const own = line("Item 1", rfq("RFQ-NEW", "OPEN"));
    expect(bomSourcing([{ items: [own] }, v1])(own)?.rfq.refNo).toBe("RFQ-NEW");
  });

  test("an award does not carry into a new version, and does not hide its new RFQ", () => {
    const awarded = line("Lactose", rfq("RFQ-OLD", "AWARDED"));
    const old = { items: [awarded] };
    const fresh = line("Lactose");
    expect(bomSourcing([{ items: [fresh] }, old])(fresh)).toBeNull();
    const reordered = line("Lactose", rfq("RFQ-NEW", "OPEN"));
    expect(bomSourcing([{ items: [reordered] }, old])(reordered)).toEqual({
      rfq: rfq("RFQ-NEW", "OPEN"),
      sourced: false,
    });
    expect(bomSourcing([old])(awarded)).toEqual({
      rfq: rfq("RFQ-OLD", "AWARDED"),
      sourced: true,
    });
  });

  test("on its own line, an awarded RFQ beats an open one; cancelled and closed free the line", () => {
    const sourcingOf = bomSourcing([]);
    expect(sourcingOf(line("API", rfq("RFQ-O", "OPEN"), rfq("RFQ-W", "AWARDED")))).toEqual({
      rfq: rfq("RFQ-W", "AWARDED"),
      sourced: true,
    });
    expect(sourcingOf(line("Solvent", rfq("RFQ-X", "CANCELLED"), rfq("RFQ-C", "CLOSED")))).toBe(
      null,
    );
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
    const old = { items: [line("Gone", rfq("RFQ-W", "AWARDED"), rfq("RFQ-X", "CANCELLED"))] };
    expect(openRfqsWithoutLine([v2, old], v2)).toEqual([]);
  });
});
