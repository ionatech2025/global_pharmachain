import { z } from "zod";
import {
  ANNOUNCEMENT_AUDIENCES,
  COMPANY_ROLES,
  COMPANY_TYPE_LABELS,
  COMPANY_TYPES,
  type CompanyType,
  SUBSCRIPTION_TIERS,
  VERIFICATION_STATUSES,
} from "../enums";
import { paginationQuerySchema } from "../pagination";
import { PARAM_KEYS } from "../params";
import { newAccountEmailSchema } from "./auth";
import { currencySchema, decimalString, optionalFilter } from "./common";

export const verificationDecisionSchema = z
  .object({
    decision: z.enum(["APPROVE", "REJECT"]),
    reason: z.string().max(1000).optional(),
  })
  .superRefine((val, ctx) => {
    // US-103: rejection reason is mandatory
    if (val.decision === "REJECT" && (!val.reason || val.reason.trim().length < 5)) {
      ctx.addIssue({
        code: "custom",
        path: ["reason"],
        message: "A rejection reason (min 5 characters) is required",
      });
    }
  });
export type VerificationDecision = z.infer<typeof verificationDecisionSchema>;

export const verificationQueueSchema = paginationQuerySchema.extend({
  status: z.enum(VERIFICATION_STATUSES).optional(),
});

export const announcementSchema = z
  .object({
    title: z.string().min(3).max(140),
    body: z.string().min(5).max(5000),
    audience: z.enum(ANNOUNCEMENT_AUDIENCES),
    targetRole: z.enum(COMPANY_ROLES).optional(),
    targetCompanyId: z.uuid().optional(),
    expiresAt: z.iso.datetime().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.audience === "ROLE" && !val.targetRole) {
      ctx.addIssue({ code: "custom", path: ["targetRole"], message: "Target role required" });
    }
    if (val.audience === "COMPANY" && !val.targetCompanyId) {
      ctx.addIssue({
        code: "custom",
        path: ["targetCompanyId"],
        message: "Target company required",
      });
    }
  });
export type AnnouncementInput = z.infer<typeof announcementSchema>;

export const parameterUpdateSchema = z.object({
  key: z.enum(Object.values(PARAM_KEYS) as [string, ...string[]]),
  value: z.string().min(1).max(200),
});

export const tierUpdateSchema = z.object({
  tier: z.enum(SUBSCRIPTION_TIERS),
});

// Super-admin override actions require a stored reason (US-203).
export const adminReasonSchema = z.object({
  reason: z.string().min(5).max(500),
});

export const adminRoleReassignSchema = adminReasonSchema.extend({
  role: z.enum(COMPANY_ROLES),
});

export const exchangeRateUpsertSchema = z
  .object({
    base: currencySchema,
    quote: currencySchema,
    rate: decimalString,
  })
  .refine((v) => v.base !== v.quote, { message: "Base and quote must differ" });

export const creditDecisionSchema = z.object({
  decision: z.enum(["CONFIRM", "REJECT"]),
  note: z.string().max(500).optional(),
});

export const auditLogQuerySchema = paginationQuerySchema.extend({
  actorUserId: optionalFilter(z.uuid()),
  actorEmail: optionalFilter(z.string().max(320)),
  entityType: optionalFilter(z.string().max(60)),
  companyId: optionalFilter(z.uuid()),
  from: optionalFilter(z.iso.datetime()),
  to: optionalFilter(z.iso.datetime()),
});

// Single or bulk client onboarding for trial cohorts (up to 200 clients per batch).
export const clientOnboardRowSchema = z.object({
  companyName: z.string().trim().min(2, "Company name is required").max(120),
  companyType: z.enum(COMPANY_TYPES).default("SUPPLIER"),
  country: z.string().trim().min(2).max(56).default("Uganda"),
  registrationNumber: z.string().trim().min(2).max(64).optional(),
  address: z.string().trim().min(2).max(240).optional(),
  contactName: z.string().trim().min(2, "Contact name is required").max(80),
  contactEmail: newAccountEmailSchema,
  contactPhone: z.string().trim().max(32).optional(),
});
export type ClientOnboardRow = z.infer<typeof clientOnboardRowSchema>;

export const bulkClientOnboardSchema = z.object({
  clients: z.array(clientOnboardRowSchema).min(1).max(200),
  sendWelcomeEmail: z.boolean().default(true),
});
export type BulkClientOnboardInput = z.infer<typeof bulkClientOnboardSchema>;

/** Splits a single CSV or TSV row while respecting RFC 4180 double-quoted fields. */
export function splitDelimitedRow(line: string): string[] {
  const delimiter = !line.includes(",") && line.includes("\t") ? "\t" : ",";
  const out: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      out.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  out.push(current.trim());
  return out;
}

export function resolveCompanyType(raw: string | undefined): CompanyType {
  if (!raw) return "SUPPLIER";
  const cleaned = raw
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
  if ((COMPANY_TYPES as readonly string[]).includes(cleaned)) {
    return cleaned as CompanyType;
  }
  const byLabel = Object.entries(COMPANY_TYPE_LABELS).find(
    ([, label]) => label.toLowerCase() === raw.trim().toLowerCase(),
  );
  if (byLabel) return byLabel[0] as CompanyType;
  return "SUPPLIER";
}

/**
 * Parses CSV or tab-separated spreadsheet rows into validated ClientOnboardRow
 * objects, reporting per-row validation or email-typo errors before submission.
 */
export function parseClientOnboardCsv(text: string): {
  rows: ClientOnboardRow[];
  errors: string[];
} {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return { rows: [], errors: [] };

  const rows: ClientOnboardRow[] = [];
  const errors: string[] = [];

  const firstLower = lines[0]?.toLowerCase() ?? "";
  const hasHeader =
    firstLower.includes("companyname") ||
    firstLower.includes("company_name") ||
    firstLower.includes("contactemail") ||
    (firstLower.includes("company") && firstLower.includes("email"));

  const dataLines = hasHeader ? lines.slice(1) : lines;

  dataLines.forEach((line, idx) => {
    const rowNum = hasHeader ? idx + 2 : idx + 1;
    const cols = splitDelimitedRow(line);
    if (cols.length < 4) {
      errors.push(
        `Row ${rowNum}: expected at least companyName, companyType, country, contactName, contactEmail`,
      );
      return;
    }

    let companyName = "";
    let companyType: CompanyType = "SUPPLIER";
    let country = "Uganda";
    let contactName = "";
    let contactEmail = "";
    let contactPhone: string | undefined;
    let registrationNumber: string | undefined;

    if (cols.length === 4) {
      [companyName, country, contactName, contactEmail] = cols as [string, string, string, string];
    } else {
      companyName = cols[0] ?? "";
      companyType = resolveCompanyType(cols[1]);
      country = cols[2] || "Uganda";
      contactName = cols[3] ?? "";
      contactEmail = cols[4] ?? "";
      contactPhone = cols[5] || undefined;
      registrationNumber = cols[6] || undefined;
    }

    const validated = clientOnboardRowSchema.safeParse({
      companyName,
      companyType,
      country: country || "Uganda",
      contactName,
      contactEmail,
      contactPhone: contactPhone || undefined,
      registrationNumber: registrationNumber || undefined,
    });

    if (!validated.success) {
      const msg = validated.error.issues[0]?.message ?? "Invalid row";
      errors.push(`Row ${rowNum} (${companyName || "unnamed"}): ${msg}`);
      return;
    }

    rows.push(validated.data);
  });

  return { rows, errors };
}
