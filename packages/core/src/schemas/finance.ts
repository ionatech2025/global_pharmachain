import { z } from "zod";
import { CURRENCIES, KYC_RISK_LEVELS, PAYMENT_METHODS } from "../enums";

// ─── Payments (Phase 3 §1) ───────────────────────────────────────────────────

export const paymentCreateSchema = z.object({
  method: z.enum(PAYMENT_METHODS),
  amount: z.number().positive().max(1_000_000_000),
  note: z.string().max(300).optional(),
});
export type PaymentCreateInput = z.infer<typeof paymentCreateSchema>;

export const paymentConfirmSchema = z.object({
  note: z.string().max(300).optional(),
});

// ─── Invoicing & tax (Phase 3 §2) ────────────────────────────────────────────

export const invoiceCreateSchema = z.object({
  hsCode: z
    .string()
    .regex(/^\d{4,10}$/, "HS codes are 4–10 digits")
    .optional(),
  // Extra charge lines on top of the order line (freight, handling…)
  extraLines: z
    .array(
      z.object({
        description: z.string().min(2).max(140),
        amount: z.number().min(-1_000_000_000).max(1_000_000_000),
      }),
    )
    .max(10)
    .optional(),
});
export type InvoiceCreateInput = z.infer<typeof invoiceCreateSchema>;

export const taxRuleSchema = z.object({
  hsPrefix: z.string().regex(/^\d{2,10}$/, "HS prefix is 2–10 digits"),
  originCountry: z.string().min(2).max(56).optional(),
  destCountry: z.string().min(2).max(56),
  dutyRatePct: z.number().min(0).max(100),
  vatRatePct: z.number().min(0).max(100),
  notes: z.string().max(300).optional(),
  active: z.boolean().optional(),
});
export type TaxRuleInput = z.infer<typeof taxRuleSchema>;

export const kycReviewSchema = z.object({
  riskLevel: z.enum(KYC_RISK_LEVELS),
  note: z.string().max(500).optional(),
});

// ─── Currency preference (Phase 3 §3) ────────────────────────────────────────

export const currencyPreferenceSchema = z.object({
  preferredCurrency: z.enum(CURRENCIES).nullable(),
});

// ─── Scheduled reports (Phase 3 §4) ──────────────────────────────────────────

export const REPORT_KINDS = ["company-finance", "platform-finance"] as const;
export type ReportKind = (typeof REPORT_KINDS)[number];

export const REPORT_FREQUENCIES = ["WEEKLY", "MONTHLY"] as const;

export const scheduledReportSchema = z.object({
  report: z.enum(REPORT_KINDS),
  frequency: z.enum(REPORT_FREQUENCIES),
  active: z.boolean(),
});
export type ScheduledReportInput = z.infer<typeof scheduledReportSchema>;

export const reportQuerySchema = z.object({
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  format: z.enum(["json", "csv", "xls", "pdf"]).default("json"),
});
export type ReportQuery = z.infer<typeof reportQuerySchema>;
