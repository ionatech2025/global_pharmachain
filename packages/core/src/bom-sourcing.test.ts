import { describe, expect, test } from "bun:test";
import { bomSourcing, openRfqsWithoutLine } from "./bom-sourcing";

const rfq = (refNo: string, status: string) => ({ id: refNo, refNo, status });
const line = (materialName: string, ...rfqs: ReturnType<typeof rfq>[]) => ({
  materialName,
  rfqs,
});

// Version 2 (newest first, as the API lists them) keeps Item 1 and drops Item 2.
const v2 = { items: [line("Item 1")] };
const v1 = {
  items: [line("Item 1", rfq("RFQ-A", "OPEN")), line("Item 2", rfq("RFQ-B", "OPEN"))],
};

describe("bomSourcing: an RFQ follows its material into later versions", () => {
  test("a kept line shows the RFQ raised from the earlier version", () => {
    const sourcingOf = bomSourcing([v2, v1]);
    expect(sourcingOf("Item 1")).toEqual({ rfq: rfq("RFQ-A", "OPEN"), sourced: false });
  });

  test("materials match regardless of case and spacing", () => {
    expect(bomSourcing([v2, v1])("  item   1 ")?.rfq.refNo).toBe("RFQ-A");
  });

  test("an awarded RFQ beats an open one; cancelled and closed ones free the line", () => {
    const sourcingOf = bomSourcing([
      { items: [line("API", rfq("RFQ-O", "OPEN"), rfq("RFQ-W", "AWARDED"))] },
      { items: [line("Solvent", rfq("RFQ-X", "CANCELLED"), rfq("RFQ-C", "CLOSED"))] },
    ]);
    expect(sourcingOf("API")).toEqual({ rfq: rfq("RFQ-W", "AWARDED"), sourced: true });
    expect(sourcingOf("Solvent")).toBeNull();
    expect(sourcingOf("Unknown")).toBeNull();
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
