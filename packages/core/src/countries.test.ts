import { describe, expect, test } from "bun:test";
import { COUNTRIES, countryFromIsoCode, isKnownCountry } from "./countries";

describe("countryFromIsoCode", () => {
  test("matches the list's own spelling for the markets the platform serves", () => {
    expect(countryFromIsoCode("UG")).toBe("Uganda");
    expect(countryFromIsoCode("ke")).toBe("Kenya");
    expect(countryFromIsoCode("TZ")).toBe("Tanzania");
    expect(countryFromIsoCode("IN")).toBe("India");
    expect(countryFromIsoCode("CN")).toBe("China");
    expect(countryFromIsoCode("NL")).toBe("Netherlands");
  });

  test("resolves states whose ISO display name differs from the list", () => {
    expect(countryFromIsoCode("CD")).toBe("Congo (Kinshasa)");
    expect(countryFromIsoCode("CZ")).toBe("Czech Republic");
    expect(countryFromIsoCode("TR")).toBe("Turkey");
    expect(countryFromIsoCode("MM")).toBe("Myanmar");
  });

  test("every alias target is a real list entry", () => {
    for (const code of [
      "AG",
      "BA",
      "CD",
      "CG",
      "CI",
      "CV",
      "CZ",
      "KN",
      "LC",
      "MM",
      "PS",
      "ST",
      "SZ",
      "TL",
      "TR",
      "TT",
      "VC",
    ]) {
      const resolved = countryFromIsoCode(code);
      expect(resolved).not.toBeNull();
      expect(COUNTRIES as readonly string[]).toContain(resolved as string);
    }
  });

  test("says null rather than guess", () => {
    expect(countryFromIsoCode(null)).toBeNull();
    expect(countryFromIsoCode("")).toBeNull();
    expect(countryFromIsoCode("XX")).toBeNull();
    expect(countryFromIsoCode("UGA")).toBeNull();
    expect(countryFromIsoCode("AQ")).toBeNull(); // Antarctica is not a trading country
  });
});

test("isKnownCountry only accepts the list's spellings", () => {
  expect(isKnownCountry("Uganda")).toBe(true);
  expect(isKnownCountry("Atlantis")).toBe(false);
  expect(isKnownCountry("uganda")).toBe(false);
});
