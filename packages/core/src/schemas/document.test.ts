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

// US-104: the expiry cycle must reach every verification document, not only the
// licences — but a date, when given, has to be a future one.
describe("expiry dates on verification documents", () => {
  const future = new Date(Date.now() + 400 * 86_400_000).toISOString().slice(0, 10);
  const past = "2020-01-01";
  const tin = { ...base, kind: "TAX_ID" as const };

  test("a TIN may omit the date (most jurisdictions never expire it)", () => {
    expect(documentRequestUploadSchema.safeParse(tin).success).toBe(true);
  });

  test("a TIN may carry a future date so an alert can be raised", () => {
    expect(documentRequestUploadSchema.safeParse({ ...tin, expiresAt: future }).success).toBe(true);
  });

  test("an already-lapsed date is refused even where the date is optional", () => {
    expect(documentRequestUploadSchema.safeParse({ ...tin, expiresAt: past }).success).toBe(false);
  });

  test("a licence still requires a date", () => {
    const licence = { ...base, kind: "TRADING_LICENCE" as const };
    expect(documentRequestUploadSchema.safeParse(licence).success).toBe(false);
    expect(documentRequestUploadSchema.safeParse({ ...licence, expiresAt: future }).success).toBe(
      true,
    );
    expect(documentRequestUploadSchema.safeParse({ ...licence, expiresAt: past }).success).toBe(
      false,
    );
  });
});
