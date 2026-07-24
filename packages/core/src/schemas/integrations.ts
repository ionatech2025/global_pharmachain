import { z } from "zod";

// ─── Partner webhooks (Phase 5 §3) ───────────────────────────────────────────

export const WEBHOOK_EVENTS = [
  "order.created",
  "order.status_changed",
  "invoice.issued",
  "payment.confirmed",
  "shipment.exception",
] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export const webhookCreateSchema = z.object({
  url: z
    .url()
    .max(500)
    .refine((u) => u.startsWith("https://"), { message: "Webhook URLs must be https" }),
  events: z.array(z.enum(WEBHOOK_EVENTS)).min(1),
});
export type WebhookCreateInput = z.infer<typeof webhookCreateSchema>;

// ─── Public API keys (Phase 5 §4) ────────────────────────────────────────────

export const API_SCOPES = [
  "read:catalogue",
  "read:orders",
  "read:rfqs",
  "write:rfqs",
  "read:trace",
] as const;
export type ApiScope = (typeof API_SCOPES)[number];

export const API_SCOPE_LABELS: Record<ApiScope, string> = {
  "read:catalogue": "Read marketplace catalogue",
  "read:orders": "Read your orders & shipments",
  "read:rfqs": "Read your RFQs & quotations",
  "write:rfqs": "Create RFQs",
  "read:trace": "Read traceability chains",
};

export const apiKeyCreateSchema = z.object({
  name: z.string().min(2).max(60),
  scopes: z.array(z.enum(API_SCOPES)).min(1),
  rateLimitPerMin: z.number().int().min(10).max(600).optional(),
});
export type ApiKeyCreateInput = z.infer<typeof apiKeyCreateSchema>;
