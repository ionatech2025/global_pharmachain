import { describe, expect, test } from "bun:test";
import { registerSchema } from "./index";

const valid = {
  company: {
    name: "Apex Pharma",
    type: "SUPPLIER",
    country: "Uganda",
    registrationNumber: "RC-1234",
    address: "Plot 1, Kampala",
    contactPhone: "+256700000000",
  },
  admin: { name: "Jane Doe", email: "jane@apex-pharma.com", password: "purple tractor sings" },
} as const;

const messages = (input: unknown) => {
  const r = registerSchema.safeParse(input);
  return r.success ? [] : r.error.issues.map((i) => i.message);
};

describe("form messages are words, not zod internals", () => {
  test("a too-short field says how many characters are needed", () => {
    const msgs = messages({ ...valid, company: { ...valid.company, name: "A" } });
    expect(msgs).toContain("Enter at least 2 characters");
    expect(msgs.join(" ")).not.toMatch(/Too small|expected string/);
  });

  test("an empty required field says it is required", () => {
    const msgs = messages({ ...valid, company: { ...valid.company, country: "" } });
    expect(msgs).toContain("Select your country");
  });

  test("a missing field says it is required", () => {
    const msgs = messages({ ...valid, admin: { name: "Jane Doe", email: "jane@apex-pharma.com" } });
    expect(msgs).toContain("This field is required");
  });

  test("explicit messages written into a schema are left alone", () => {
    const msgs = messages({ ...valid, admin: { ...valid.admin, password: "short" } });
    expect(msgs.join(" ")).toMatch(/at least 15 characters/i);
  });

  test("a valid registration still parses", () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });
});
