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

/**
 * Hosts of the browser push services. A subscription endpoint is a URL the
 * browser hands us and the server then POSTs to, so without this check any
 * signed-in user could point the platform's outbound requests at an address
 * of their choosing (internal services, cloud metadata, a third party).
 * Chrome/Opera/Samsung → FCM, Firefox → Mozilla autopush, Edge → WNS,
 * Safari → Apple.
 */
const PUSH_SERVICE_HOSTS = [
  "fcm.googleapis.com",
  ".push.services.mozilla.com",
  ".notify.windows.com",
  ".push.apple.com",
];

export function isKnownPushEndpoint(endpoint: string): boolean {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return false;
    const host = url.hostname.toLowerCase();
    return PUSH_SERVICE_HOSTS.some((h) => (h.startsWith(".") ? host.endsWith(h) : host === h));
  } catch {
    return false;
  }
}

export const pushSubscribeSchema = z.object({
  endpoint: z.url().max(1000).refine(isKnownPushEndpoint, "Not a browser push service endpoint"),
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
  // Optional: the language picker is withdrawn until the interface is
  // translated, so the account page sends only the time zone.
  locale: z.enum(SUPPORTED_LOCALES).nullable().optional(),
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
