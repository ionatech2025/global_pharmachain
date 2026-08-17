import { describe, expect, test } from "bun:test";
import { listingCreateSchema } from "./catalogue";

const rawMaterial = {
  kind: "RAW_MATERIAL" as const,
  name: "Paracetamol API",
  countryOfOrigin: "India",
  packagingType: "Drum",
  packSize: "25",
  unit: "kg",
  categoryId: "01a00ef6-884d-7e52-8630-cc267f7ac796",
  price: "12.50",
  currency: "USD" as const,
};

describe("listingCreateSchema (US-302)", () => {
  test("a raw material can be saved without a CAS number", () => {
    // CAS is enforced at publish time (catalogue.service.ts#publish), not at
    // create/save, so an incomplete draft must not be rejected outright.
    const result = listingCreateSchema.safeParse(rawMaterial);
    expect(result.success).toBe(true);
  });

  test("a raw material with a well-formed CAS number still saves", () => {
    const result = listingCreateSchema.safeParse({ ...rawMaterial, casNumber: "103-90-2" });
    expect(result.success).toBe(true);
  });

  test("a malformed CAS number is still rejected", () => {
    const result = listingCreateSchema.safeParse({ ...rawMaterial, casNumber: "not-a-cas" });
    expect(result.success).toBe(false);
  });

  test("a finished product never needed a CAS number", () => {
    const result = listingCreateSchema.safeParse({ ...rawMaterial, kind: "FINISHED_PRODUCT" });
    expect(result.success).toBe(true);
  });
});
