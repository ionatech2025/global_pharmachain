"use client";

import { Badge } from "@pharmachain/ui/components/badge";
import { Button } from "@pharmachain/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pharmachain/ui/components/card";
import { Input } from "@pharmachain/ui/components/input";
import { Label } from "@pharmachain/ui/components/label";
import { PasswordInput } from "@pharmachain/ui/components/password-input";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/browser";
import { useQueryClient } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/http";

interface PasskeyRow {
  id: string;
  name: string;
  deviceType: string;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

const when = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

/**
 * Passkeys and security keys (WebAuthn). A passkey is a phishing-resistant second factor:
 * unlike a typed code it cannot be handed to a fake sign-in page. Platform admins who
 * enrol one must use it to sign in.
 */
export function PasskeysCard({ isPlatformAdmin }: { isPlatformAdmin: boolean }) {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<PasskeyRow[] | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [password, setPassword] = useState("");

  const load = useCallback(async () => {
    try {
      setItems(await api.get<PasskeyRow[]>("/auth/passkeys"));
      // Keeps the platform-admin nudge in step with what was just added or removed.
      void queryClient.invalidateQueries({ queryKey: ["passkeys"] });
    } catch (err) {
      toast.error(errorMessage(err));
      setItems([]);
    }
  }, [queryClient]);

  useEffect(() => {
    void load();
  }, [load]);

  async function add() {
    setBusy(true);
    try {
      const optionsJSON = await api.post<PublicKeyCredentialCreationOptionsJSON>(
        "/auth/passkeys/register/options",
      );
      const { startRegistration } = await import("@simplewebauthn/browser");
      const response = await startRegistration({ optionsJSON });
      await api.post("/auth/passkeys/register/verify", {
        response,
        name: name.trim() || "Passkey",
      });
      setName("");
      toast.success("Passkey added");
      await load();
    } catch (err) {
      // The browser cancelling the prompt is not a server error; say so plainly.
      const cancelled =
        err instanceof Error && /NotAllowed|cancel|abort/i.test(err.name + err.message);
      toast.error(cancelled ? "Passkey setup was cancelled." : errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    setBusy(true);
    try {
      await api.post(`/auth/passkeys/${id}/remove`, { currentPassword: password });
      setRemoving(null);
      setPassword("");
      toast.success("Passkey removed");
      await load();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card id="passkeys">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <KeyRound className="size-4" aria-hidden="true" /> Passkeys
        </CardTitle>
        <CardDescription>
          Sign in with your device's fingerprint, face or PIN, or a hardware key — nothing to type,
          and nothing a fake sign-in page can capture.{" "}
          {isPlatformAdmin
            ? "As a platform administrator you will have to use a passkey to sign in once you add one — add at least two, so losing a device never locks you out."
            : "Once you add one, it is asked for after your password."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {items === null ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No passkeys yet.</p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {items.map((p) => (
              <li key={p.id} className="grid gap-2 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Added {when(p.createdAt)} ·{" "}
                      {p.lastUsedAt ? `last used ${when(p.lastUsedAt)}` : "never used"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.backedUp && <Badge variant="outline">synced</Badge>}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        setRemoving(removing === p.id ? null : p.id);
                        setPassword("");
                      }}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
                {removing === p.id && (
                  <form
                    className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void remove(p.id);
                    }}
                  >
                    <div className="grid gap-1.5">
                      <Label htmlFor={`rm-${p.id}`}>Confirm with your password</Label>
                      <PasswordInput
                        id={`rm-${p.id}`}
                        fieldName="password"
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>
                    <Button type="submit" variant="destructive" disabled={busy || !password}>
                      Remove passkey
                    </Button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="grid gap-1.5">
            <Label htmlFor="passkey-name">Name (optional)</Label>
            <Input
              id="passkey-name"
              maxLength={60}
              placeholder="e.g. Work laptop, YubiKey"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <Button type="button" onClick={add} disabled={busy}>
            {busy && removing === null ? "Waiting for your device…" : "Add a passkey"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
