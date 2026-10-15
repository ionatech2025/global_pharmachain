import { describe, expect, test } from "bun:test";
import { bulkClientOnboardSchema, parseClientOnboardCsv } from "./admin";
import {
  issueAdminUpdateSchema,
  issueCreateSchema,
  issueQuerySchema,
  issueReplySchema,
} from "./issue";

describe("issueCreateSchema", () => {
  test("accepts valid issue payload and applies defaults", () => {
    const parsed = issueCreateSchema.parse({
      subject: "Cannot upload PDF certificate on verification page",
      description: "When clicking upload on the GMP certificate row, the spinner hangs.",
    });
    expect(parsed.category).toBe("BUG");
    expect(parsed.priority).toBe("MEDIUM");
  });

  test("rejects short subject or description", () => {
    expect(
      issueCreateSchema.safeParse({
        subject: "Bug",
        description: "Too short",
      }).success,
    ).toBe(false);
  });
});

describe("issueReplySchema & issueAdminUpdateSchema", () => {
  test("validates replies and requires at least one field on admin update", () => {
    expect(issueReplySchema.safeParse({ body: "Fixed in latest deployment." }).success).toBe(true);
    expect(issueReplySchema.safeParse({ body: "x" }).success).toBe(false);

    expect(issueAdminUpdateSchema.safeParse({}).success).toBe(false);
    expect(
      issueAdminUpdateSchema.safeParse({
        status: "RESOLVED",
        resolution: "Resolved timeout issue on upload route.",
      }).success,
    ).toBe(true);
  });

  test("issueQuerySchema coerces empty filters to undefined", () => {
    const parsed = issueQuerySchema.parse({ status: "", priority: "HIGH", page: "2" });
    expect(parsed.status).toBeUndefined();
    expect(parsed.priority).toBe("HIGH");
    expect(parsed.page).toBe(2);
  });
});

describe("bulkClientOnboardSchema", () => {
  test("validates a batch of trial clients and catches mistyped email domains", () => {
    const valid = bulkClientOnboardSchema.safeParse({
      clients: [
        {
          companyName: "Victoria Meds Ltd",
          companyType: "WHOLESALE_PHARMACY",
          country: "Uganda",
          contactName: "Dr. Sarah Kato",
          contactEmail: "sarah@victoriameds.co.ug",
        },
      ],
    });
    expect(valid.success).toBe(true);

    const typo = bulkClientOnboardSchema.safeParse({
      clients: [
        {
          companyName: "Typo Pharma",
          contactName: "John Doe",
          contactEmail: "john@gmai.com",
        },
      ],
    });
    expect(typo.success).toBe(false);
  });

  test("parseClientOnboardCsv parses quoted commas, TSV rows, human labels, and flags domain typos", () => {
    const csv = [
      "companyName,companyType,country,contactName,contactEmail,contactPhone,registrationNumber",
      '"Victoria Meds, Ltd.",Wholesale Pharmacy,Uganda,"Kato, Dr. Sarah",sarah@victoriameds.co.ug,+256701000111,UG-VM-01',
      "Rift Valley Lab\tLaboratory Consumables Suppliers\tKenya\tJames Ochieng\tjames@riftlab.co.ke",
      "Bad Email Co,SUPPLIER,Uganda,John Typo,john@gmai.com",
    ].join("\n");

    const { rows, errors } = parseClientOnboardCsv(csv);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.companyName).toBe("Victoria Meds, Ltd.");
    expect(rows[0]?.companyType).toBe("WHOLESALE_PHARMACY");
    expect(rows[0]?.contactName).toBe("Kato, Dr. Sarah");
    expect(rows[1]?.companyType).toBe("LABORATORY_CONSUMABLES_SUPPLIER");
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/Did you mean @gmail\.com/i);
  });
});
