import { describe, expect, test } from "bun:test";
import { can } from "./rbac";

// US-204 role boundaries
describe("rbac matrix", () => {
  test("company admin can do everything", () => {
    expect(can("COMPANY_ADMIN", "members:manage")).toBe(true);
    expect(can("COMPANY_ADMIN", "company:manage")).toBe(true);
    expect(can("COMPANY_ADMIN", "catalogue:write")).toBe(true);
  });

  test("operations manage catalogue/rfq/shipments but not members or billing", () => {
    expect(can("OPERATIONS", "catalogue:write")).toBe(true);
    expect(can("OPERATIONS", "rfq:write")).toBe(true);
    expect(can("OPERATIONS", "quotation:write")).toBe(true);
    expect(can("OPERATIONS", "order:update-status")).toBe(true);
    expect(can("OPERATIONS", "members:manage")).toBe(false);
    expect(can("OPERATIONS", "company:manage")).toBe(false);
    // "No billing" is the half this test's title promised and never checked;
    // Operations held finance:read until the 2026-10-29 client review.
    expect(can("OPERATIONS", "finance:read")).toBe(false);
    expect(can("OPERATIONS", "finance:manage")).toBe(false);
    // What they do keep: this month's allowance, needed to raise RFQs.
    expect(can("OPERATIONS", "usage:read")).toBe(true);
  });

  test("finance read orders and handle documents, but no catalogue writes", () => {
    expect(can("FINANCE", "order:read")).toBe(true);
    expect(can("FINANCE", "document:write")).toBe(true);
    expect(can("FINANCE", "catalogue:write")).toBe(false);
    expect(can("FINANCE", "rfq:write")).toBe(false);
    expect(can("FINANCE", "members:manage")).toBe(false);
    expect(can("FINANCE", "finance:read")).toBe(true);
    expect(can("FINANCE", "finance:manage")).toBe(true);
  });
});
