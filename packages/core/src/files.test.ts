import { describe, expect, test } from "bun:test";
import { expiryRequired, isAllowedMime, requiredVerificationKinds } from "./files";

describe("file rules", () => {
  test("SDS accepts PDF only (US-303)", () => {
    expect(isAllowedMime("SDS", "application/pdf")).toBe(true);
    expect(isAllowedMime("SDS", "image/png")).toBe(false);
  });

  test("order documents accept office formats (US-501)", () => {
    expect(
      isAllowedMime(
        "PROFORMA_INVOICE",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ),
    ).toBe(true);
    expect(isAllowedMime("PROFORMA_INVOICE", "application/zip")).toBe(false);
  });

  test("licence kinds require expiry dates (US-102)", () => {
    expect(expiryRequired("TRADING_LICENCE")).toBe(true);
    expect(expiryRequired("GMP_CERTIFICATE")).toBe(true);
    expect(expiryRequired("CERTIFICATE_OF_INCORPORATION")).toBe(false);
  });

  test("manufacturers need manufacturing licence + GMP in the checklist", () => {
    expect(requiredVerificationKinds("FINISHED_PRODUCT_MANUFACTURER")).toContain("GMP_CERTIFICATE");
    expect(requiredVerificationKinds("SUPPLIER")).not.toContain("GMP_CERTIFICATE");
  });
});
