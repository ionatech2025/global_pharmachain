import { describe, expect, test } from "bun:test";
import { documentRequestUploadSchema } from "./document";

const base = {
  fileName: "coa.pdf",
  contentType: "application/pdf",
  size: 1024,
};
const LISTING_ID = "01a00ef6-884d-7e52-8630-cc267f7ac796";
const ORDER_ID = "01a00ef6-884d-7e52-8630-cc267f7ac797";

// QA Figure 11: the marketplace leads on the Certificate of Analysis, so a CoA
// has to be attachable to a catalogue listing — it used to be an order-only
// document kind.
describe("Certificate of Analysis links", () => {
  test("attaches to a listing", () => {
    const result = documentRequestUploadSchema.safeParse({
      ...base,
      kind: "CERTIFICATE_OF_ANALYSIS",
      listingId: LISTING_ID,
    });
    expect(result.success).toBe(true);
  });

  test("still attaches to an order", () => {
    const result = documentRequestUploadSchema.safeParse({
      ...base,
      kind: "CERTIFICATE_OF_ANALYSIS",
      orderId: ORDER_ID,
    });
    expect(result.success).toBe(true);
  });

  test("must link to one of the two", () => {
    const result = documentRequestUploadSchema.safeParse({
      ...base,
      kind: "CERTIFICATE_OF_ANALYSIS",
    });
    expect(result.success).toBe(false);
  });

  test("never to both at once", () => {
    const result = documentRequestUploadSchema.safeParse({
      ...base,
      kind: "CERTIFICATE_OF_ANALYSIS",
      listingId: LISTING_ID,
      orderId: ORDER_ID,
    });
    expect(result.success).toBe(false);
  });
});

describe("other order documents are unchanged", () => {
  test("a bill of lading still requires an order", () => {
    const withoutOrder = documentRequestUploadSchema.safeParse({
      ...base,
      kind: "BILL_OF_LADING",
    });
    expect(withoutOrder.success).toBe(false);

    const withOrder = documentRequestUploadSchema.safeParse({
      ...base,
      kind: "BILL_OF_LADING",
      orderId: ORDER_ID,
    });
    expect(withOrder.success).toBe(true);
  });

  test("an SDS still requires a listing", () => {
    const result = documentRequestUploadSchema.safeParse({ ...base, kind: "SDS" });
    expect(result.success).toBe(false);
  });
});
