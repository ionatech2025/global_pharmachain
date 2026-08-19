import { z } from "zod";
import {
  ANNOUNCEMENT_AUDIENCES,
  COMPANY_ROLES,
  SUBSCRIPTION_TIERS,
  VERIFICATION_STATUSES,
} from "../enums";
import { paginationQuerySchema } from "../pagination";
import { PARAM_KEYS } from "../params";
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
