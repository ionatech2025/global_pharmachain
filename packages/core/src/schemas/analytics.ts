import { z } from "zod";
import { DASHBOARD_WIDGETS, PHARMACOPOEIA_STANDARDS, RATEABLE_ROLES } from "../enums";

// ─── Ratings & trust (Phase 4 §3) ────────────────────────────────────────────

export const ratingCreateSchema = z.object({
  targetCompanyId: z.uuid(),
  targetRole: z.enum(RATEABLE_ROLES),
  stars: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});
export type RatingCreateInput = z.infer<typeof ratingCreateSchema>;

export const ratingFlagSchema = z.object({
  reason: z.string().min(5).max(500),
});

export const ratingModerateSchema = z.object({
  action: z.enum(["RESTORE", "REMOVE"]),
  note: z.string().max(500).optional(),
});

// ─── Push subscriptions (Phase 4 §1) ─────────────────────────────────────────

export const pushSubscribeSchema = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({
    p256dh: z.string().min(16).max(256),
    auth: z.string().min(8).max(64),
  }),
});
export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;

// ─── Dashboard customisation (Phase 4 §2) ────────────────────────────────────

const WIDGET_KEYS = DASHBOARD_WIDGETS.map((w) => w.key) as [string, ...string[]];

export const dashboardPrefSchema = z.object({
  widgets: z.array(z.enum(WIDGET_KEYS)).max(DASHBOARD_WIDGETS.length),
});
export type DashboardPrefInput = z.infer<typeof dashboardPrefSchema>;

// ─── Locale & timezone (Phase 4 §4) ──────────────────────────────────────────

export const SUPPORTED_LOCALES = ["en", "fr", "sw", "hi", "zh", "pt"] as const;

export const localePrefSchema = z.object({
  locale: z.enum(SUPPORTED_LOCALES).nullable(),
  timeZone: z
    .string()
    .max(64)
    .refine(
      (tz) => {
        try {
          new Intl.DateTimeFormat("en", { timeZone: tz });
          return true;
        } catch {
          return false;
        }
      },
      { message: "Unknown IANA time zone" },
    )
    .nullable(),
});

// ─── Compliance profile (Phase 4 §4) ─────────────────────────────────────────

export const complianceProfileSchema = z.object({
  reachStatus: z.string().max(300).nullable().optional(),
  ehsReport: z.string().max(4000).nullable().optional(),
});

export const listingStandardsSchema = z.array(z.enum(PHARMACOPOEIA_STANDARDS)).max(4);
