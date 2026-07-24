"use client";

import { API_SCOPE_LABELS, API_SCOPES, WEBHOOK_EVENTS } from "@pharmachain/core";
import { Badge } from "@pharmachain/ui/components/badge";
import { Button } from "@pharmachain/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@pharmachain/ui/components/dialog";
import { Input } from "@pharmachain/ui/components/input";
import { Label } from "@pharmachain/ui/components/label";
import { KeyRound, Plus, Webhook as WebhookIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/http";
import { fmtDateTime } from "@/lib/format";

export function CreateApiKeyButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["read:catalogue"]);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const created = await api.post<{ token: string }>("/api-keys", { name, scopes });
      setToken(created.token);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setToken(null);
          setName("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <KeyRound className="size-4" /> New API key
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create an API key</DialogTitle>
          <DialogDescription>
            Scoped and rate-limited. The key is shown once — only its hash is stored.
          </DialogDescription>
        </DialogHeader>
        {token ? (
          <div className="space-y-3">
            <p className="text-sm">Copy your key now — it will not be shown again:</p>
            <code className="block overflow-x-auto rounded-lg border bg-muted/40 p-3 text-xs">
              {token}
            </code>
            <DialogFooter>
              <Button
                onClick={() => {
                  void navigator.clipboard?.writeText(token);
                  toast.success("Copied");
                }}
              >
                Copy & close
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="key-name">Name</Label>
              <Input
                id="key-name"
                required
                minLength={2}
                maxLength={60}
                placeholder="ERP connector"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Scopes</Label>
              {API_SCOPES.map((scope) => (
                <label key={scope} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--color-primary)]"
                    checked={scopes.includes(scope)}
                    onChange={(e) =>
                      setScopes((current) =>
                        e.target.checked ? [...current, scope] : current.filter((s) => s !== scope),
                      )
                    }
                  />
                  <span className="font-mono text-xs">{scope}</span>
                  <span className="text-muted-foreground">{API_SCOPE_LABELS[scope]}</span>
                </label>
              ))}
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy || scopes.length === 0}>
                {busy ? "Creating…" : "Create key"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function RevokeKeyButton({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await api.post(`/api-keys/${id}/revoke`, {});
          toast.success("Key revoked");
          router.refresh();
        } catch (err) {
          toast.error(errorMessage(err));
          setBusy(false);
        }
      }}
    >
      Revoke
    </Button>
  );
}

export function CreateWebhookButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["order.status_changed"]);
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const created = await api.post<{ secret: string }>("/webhooks", { url, events });
      setSecret(created.secret);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setSecret(null);
          setUrl("");
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <WebhookIcon className="size-4" /> New webhook
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add a webhook endpoint</DialogTitle>
          <DialogDescription>
            Signed deliveries (HMAC over timestamp.deliveryId.body) with retries and replay
            protection — the surface ERP and accounting connectors consume.
          </DialogDescription>
        </DialogHeader>
        {secret ? (
          <div className="space-y-3">
            <p className="text-sm">Signing secret (shown once):</p>
            <code className="block overflow-x-auto rounded-lg border bg-muted/40 p-3 text-xs">
              {secret}
            </code>
            <DialogFooter>
              <Button
                onClick={() => {
                  void navigator.clipboard?.writeText(secret);
                  toast.success("Copied");
                }}
              >
                Copy & close
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="wh-url">HTTPS endpoint</Label>
              <Input
                id="wh-url"
                type="url"
                required
                placeholder="https://erp.example.com/hooks/pharmachain"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label>Events</Label>
              {WEBHOOK_EVENTS.map((event) => (
                <label key={event} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-[var(--color-primary)]"
                    checked={events.includes(event)}
                    onChange={(e) =>
                      setEvents((current) =>
                        e.target.checked ? [...current, event] : current.filter((v) => v !== event),
                      )
                    }
                  />
                  <span className="font-mono text-xs">{event}</span>
                </label>
              ))}
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy || events.length === 0 || !url}>
                {busy ? "Creating…" : "Add endpoint"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function WebhookRowActions({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function act(path: string, message: string) {
    setBusy(true);
    try {
      const result = await api.post<{ deliveredNow?: number }>(path, {});
      toast.success(
        result.deliveredNow !== undefined
          ? `${message} — delivered: ${result.deliveredNow}`
          : message,
      );
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="flex gap-1.5">
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => act(`/webhooks/${id}/test`, "Test event sent")}
      >
        Send test
      </Button>
      <Button
        size="sm"
        variant="ghost"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api.delete(`/webhooks/${id}`);
            toast.success("Webhook disabled");
            router.refresh();
          } catch (err) {
            toast.error(errorMessage(err));
            setBusy(false);
          }
        }}
      >
        Disable
      </Button>
    </div>
  );
}

export function DeliveryBadge({
  delivered,
  status,
}: {
  delivered: boolean;
  status: number | null;
}) {
  return (
    <Badge variant={delivered ? "success" : "warning"}>
      {delivered ? `delivered${status ? ` (${status})` : ""}` : "pending"}
    </Badge>
  );
}

export function fmtLastUsed(value: string | null): string {
  return value ? fmtDateTime(value) : "never";
}
