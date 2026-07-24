import { API_SCOPE_LABELS, API_SCOPES, WEBHOOK_EVENTS } from "@pharmachain/core";
import { Badge } from "@pharmachain/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pharmachain/ui/components/card";
import { PageHeader } from "@/components/page-header";
import { apiServer } from "@/lib/api/server";
import { fmtDate, fmtDateTime } from "@/lib/format";
import {
  CreateApiKeyButton,
  CreateWebhookButton,
  RevokeKeyButton,
  WebhookRowActions,
} from "./dev-panels";

export const metadata = { title: "Developers" };

interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  rateLimitPerMin: number;
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}
interface WebhookRow {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  failCount: number;
  lastSuccessAt: string | null;
  createdAt: string;
}

const V1_ENDPOINTS = [
  ["GET /api/backend/v1/catalogue", "read:catalogue", "Published marketplace listings"],
  ["GET /api/backend/v1/orders", "read:orders", "Your orders with status, totals and ETAs"],
  ["GET /api/backend/v1/rfqs", "read:rfqs", "Your RFQs"],
  ["GET /api/backend/v1/orders/:id/trace", "read:trace", "Hash-chained traceability events"],
] as const;

/** Developer portal (Phase 5 §4): keys, webhooks and endpoint documentation. */
export default async function DevelopersPage() {
  const api = await apiServer();
  const [keys, webhooks] = await Promise.all([
    api.get<ApiKeyRow[]>("/api-keys"),
    api.get<WebhookRow[]>("/webhooks"),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Integrations"
        title="Developers"
        description="Partner API keys, signed webhooks and the endpoint reference — the surface ERP, accounting and port-community connectors consume."
      >
        <div className="flex gap-2">
          <CreateWebhookButton />
          <CreateApiKeyButton />
        </div>
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">API keys</CardTitle>
          <CardDescription>
            `Authorization: Bearer pck_…` — scoped, rate-limited per key, hash-stored.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {keys.length === 0 ? (
            <p className="text-sm text-muted-foreground">No keys yet.</p>
          ) : (
            <ul className="space-y-2">
              {keys.map((key) => (
                <li
                  key={key.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 text-sm"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{key.name}</span>
                    <code className="text-xs text-muted-foreground">{key.prefix}…</code>
                    {key.scopes.map((scope) => (
                      <Badge key={scope} variant="outline" className="font-mono text-[10px]">
                        {scope}
                      </Badge>
                    ))}
                    {key.revokedAt && <Badge variant="destructive">revoked</Badge>}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {key.rateLimitPerMin}/min · last used{" "}
                    {key.lastUsedAt ? fmtDateTime(key.lastUsedAt) : "never"}
                    {!key.revokedAt && <RevokeKeyButton id={key.id} />}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Webhooks</CardTitle>
          <CardDescription>
            Signed with `x-pharmachain-signature: v1=HMAC-SHA256(timestamp.deliveryId.body)`; verify
            the timestamp window and delivery id for replay protection. Retries: quadratic backoff,
            6 attempts.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {webhooks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No endpoints yet.</p>
          ) : (
            <ul className="space-y-2">
              {webhooks.map((hook) => (
                <li
                  key={hook.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 text-sm"
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <code className="max-w-72 truncate text-xs">{hook.url}</code>
                    {hook.events.map((event) => (
                      <Badge key={event} variant="secondary" className="font-mono text-[10px]">
                        {event}
                      </Badge>
                    ))}
                    {!hook.active && <Badge variant="destructive">disabled</Badge>}
                    {hook.failCount > 0 && (
                      <Badge variant="warning">{hook.failCount} recent failure(s)</Badge>
                    )}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {hook.lastSuccessAt ? `ok ${fmtDate(hook.lastSuccessAt)}` : "no delivery yet"}
                    {hook.active && <WebhookRowActions id={hook.id} />}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Endpoint reference</CardTitle>
          <CardDescription>
            All endpoints return the platform's JSON envelope; errors carry
            `error.code`/`error.message`. Rate limits are per key.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {V1_ENDPOINTS.map(([endpoint, scope, description]) => (
            <div key={endpoint} className="flex flex-wrap items-center gap-2 text-sm">
              <code className="rounded bg-muted/60 px-2 py-0.5 text-xs">{endpoint}</code>
              <Badge variant="outline" className="font-mono text-[10px]">
                {scope}
              </Badge>
              <span className="text-muted-foreground">{description}</span>
            </div>
          ))}
          <p className="pt-2 text-xs text-muted-foreground">
            Scopes: {API_SCOPES.map((scope) => `${scope} (${API_SCOPE_LABELS[scope]})`).join(" · ")}
            . Webhook events: {WEBHOOK_EVENTS.join(", ")}.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
