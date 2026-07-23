"use client";

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
import { signOut } from "next-auth/react";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { api } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/http";

function ChangePasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirm) {
      toast.error("New passwords don't match");
      return;
    }
    setBusy(true);
    try {
      await api.post("/auth/me/change-password", { currentPassword, newPassword });
      toast.success("Password changed — sign in again with your new password");
      await signOut({ callbackUrl: "/login" });
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Change password</CardTitle>
        <CardDescription>
          Changing your password signs out every session, including this one.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="current">Current password</Label>
            <Input
              id="current"
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="new">New password</Label>
              <Input
                id="new"
                type="password"
                autoComplete="new-password"
                required
                minLength={12}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirm">Confirm new password</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Button type="submit" disabled={busy}>
              {busy ? "Changing…" : "Change password"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function WhatsappCard() {
  const [number, setNumber] = useState("");
  const [busy, setBusy] = useState(false);
  // Challenge-response verification (US-604): a code arrives on the number
  // itself; notifications only flow once it's confirmed.
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [code, setCode] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put("/auth/me/whatsapp", { number });
      setAwaitingCode(true);
      toast.success("Verification code sent to your WhatsApp number");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/auth/me/whatsapp/verify", { code });
      setAwaitingCode(false);
      setNumber("");
      setCode("");
      toast.success("Number verified — WhatsApp notifications are active");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">WhatsApp notifications</CardTitle>
        <CardDescription>
          International format (e.g. +256700000000). A verification code is sent to the number;
          notifications start once it's confirmed. Manage which events use it on the notifications
          page.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
          <div className="min-w-52 flex-1">
            <Input
              placeholder="+256700000000"
              required
              aria-label="WhatsApp number"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={busy}>
            {busy ? "Working…" : awaitingCode ? "Resend code" : "Save number"}
          </Button>
        </form>
        {awaitingCode && (
          <form onSubmit={verify} className="flex flex-wrap items-end gap-2">
            <div className="w-40">
              <Input
                placeholder="6-digit code"
                required
                inputMode="numeric"
                pattern="\d{6}"
                aria-label="Verification code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <Button type="submit" variant="secondary" disabled={busy || code.length !== 6}>
              Verify number
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}

function DataPrivacyCard() {
  const [exporting, setExporting] = useState(false);
  const [requesting, setRequesting] = useState(false);

  async function exportData() {
    setExporting(true);
    try {
      const data = await api.get<unknown>("/auth/me/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "pharmachain-data-export.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setExporting(false);
    }
  }

  async function requestDeletion() {
    setRequesting(true);
    try {
      await api.post("/auth/me/deletion-request");
      toast.success("Deletion request submitted — the platform team has been notified");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRequesting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Your data</CardTitle>
        <CardDescription>
          Export a copy of your personal data, or request account deletion (30-day SLA, US-1003).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={exportData} disabled={exporting}>
          {exporting ? "Preparing…" : "Download my data (JSON)"}
        </Button>
        <ConfirmDialog
          trigger={
            <Button variant="destructive" disabled={requesting}>
              Request account deletion
            </Button>
          }
          title="Request account deletion?"
          description="The platform team processes requests within 30 days; your account is then anonymized and deactivated. Records the law requires us to keep (audit and financial history) are retained."
          confirmLabel="Request deletion"
          destructive
          onConfirm={requestDeletion}
        />
      </CardContent>
    </Card>
  );
}

export function AccountPanels({ totpEnabled }: { totpEnabled: boolean }) {
  return (
    <div className="space-y-4">
      <ChangePasswordCard />
      <TotpCard initiallyEnabled={totpEnabled} />
      <WhatsappCard />
      <DataPrivacyCard />
    </div>
  );
}

/** TOTP second factor (deferred item): setup → confirm a live code → enabled;
 *  disabling requires password + a current code. */
function TotpCard({ initiallyEnabled }: { initiallyEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initiallyEnabled);
  const [setup, setSetup] = useState<{ secret: string; otpauth: string } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function startSetup() {
    setBusy(true);
    try {
      setSetup(await api.post<{ secret: string; otpauth: string }>("/auth/me/totp/setup"));
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function enable(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/auth/me/totp/enable", { code });
      setEnabled(true);
      setSetup(null);
      setCode("");
      toast.success("Two-factor authentication is on — you'll be asked for a code at sign-in");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function disable(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/auth/me/totp/disable", { password, code });
      setEnabled(false);
      setPassword("");
      setCode("");
      toast.success("Two-factor authentication is off");
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Two-factor authentication</CardTitle>
        <CardDescription>
          {enabled
            ? "On — sign-in asks for a 6-digit code from your authenticator app."
            : "Add a 6-digit authenticator code on top of your password."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!enabled && !setup && (
          <Button onClick={startSetup} disabled={busy}>
            {busy ? "Preparing…" : "Set up authenticator"}
          </Button>
        )}
        {!enabled && setup && (
          <form onSubmit={enable} className="grid gap-3">
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="font-medium">1. Add PharmaChain to your authenticator app</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Enter this key manually (Google Authenticator, 1Password, Authy…):
              </p>
              <code className="mt-1 block break-all text-xs select-all">{setup.secret}</code>
              <p className="mt-2 text-xs text-muted-foreground">
                Or paste the full URI: <code className="break-all select-all">{setup.otpauth}</code>
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-40">
                <Label htmlFor="totp-enable-code">2. Enter the current code</Label>
                <Input
                  id="totp-enable-code"
                  className="mt-1"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={busy || code.length !== 6}>
                Turn on
              </Button>
            </div>
          </form>
        )}
        {enabled && (
          <form onSubmit={disable} className="flex flex-wrap items-end gap-2">
            <div className="min-w-44 flex-1">
              <Label htmlFor="totp-disable-password">Password</Label>
              <Input
                id="totp-disable-password"
                className="mt-1"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="w-36">
              <Label htmlFor="totp-disable-code">Current code</Label>
              <Input
                id="totp-disable-code"
                className="mt-1"
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <Button type="submit" variant="destructive" disabled={busy}>
              Turn off
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
