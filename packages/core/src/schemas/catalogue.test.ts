import { describe, expect, test } from "bun:test";
import { DEFAULT_PAGE_SIZE } from "../pagination";
import { catalogueSearchSchema, listingCreateSchema } from "./catalogue";

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

describe("catalogueSearchSchema — unset filters", () => {
  // QA Figure 2: pressing Search with every control at its default submitted
  // `categoryId=&kind=`, which `z.uuid()`/`z.enum()` rejected — so a plain
  // marketplace search 400'd and the page rendered its error boundary.
  test('an empty string means "no filter", not an invalid value', () => {
    const result = catalogueSearchSchema.safeParse({
      q: "",
      categoryId: "",
      kind: "",
      country: "",
      certification: "",
      sort: "",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.categoryId).toBeUndefined();
    expect(result.data.kind).toBeUndefined();
    expect(result.data.q).toBeUndefined();
    // An unset sort still lands on its default rather than becoming undefined.
    expect(result.data.sort).toBe("relevance");
  });

  test("a genuinely malformed filter is still rejected", () => {
    const result = catalogueSearchSchema.safeParse({ categoryId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  test("real filter values pass through untouched", () => {
    const id = "01a00ef6-884d-7e52-8630-cc267f7ac796";
    const result = catalogueSearchSchema.safeParse({ categoryId: id, kind: "RAW_MATERIAL" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.categoryId).toBe(id);
  });

  test("every list paginates at the same size", () => {
    const result = catalogueSearchSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(DEFAULT_PAGE_SIZE).toBe(10);
  });
});
