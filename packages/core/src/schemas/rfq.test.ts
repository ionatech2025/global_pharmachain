import { describe, expect, test } from "bun:test";
import { rfqCreateSchema } from "./rfq";

const base = {
  title: "Lactose",
  unit: "kg",
  targetCompanyType: "RAW_MATERIAL_MANUFACTURER",
  deadline: new Date(Date.now() + 864e5).toISOString(),
};
const quantityOk = (quantity: string) => rfqCreateSchema.safeParse({ ...base, quantity }).success;

describe("rfqCreateSchema quantity fits Rfq.quantity, Decimal(16,4)", () => {
  test("accepts whole numbers and up to 4 decimal places", () => {
    expect(quantityOk("100")).toBe(true);
    expect(quantityOk("0.0001")).toBe(true);
  });

  test("refuses what would be rounded on save, and zero", () => {
    // A BOM per-unit figure such as 0.000125 used to be stored as 0.0001.
    expect(quantityOk("0.000125")).toBe(false);
    expect(quantityOk("0")).toBe(false);
    expect(quantityOk("0.0000")).toBe(false);
  });
});
