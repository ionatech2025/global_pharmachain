"use client";

import { Badge } from "@pharmachain/ui/components/badge";
import { Button } from "@pharmachain/ui/components/button";
import { Input } from "@pharmachain/ui/components/input";
import { Label } from "@pharmachain/ui/components/label";
import { ShieldCheck, ShieldX } from "lucide-react";
import { useState } from "react";

interface VerifyResult {
  authentic: boolean;
  reason?: string;
  eventType?: string;
  recordedAt?: string;
  seq?: number;
  chainLength?: number;
}

export function VerifyForm() {
  const [orderNo, setOrderNo] = useState("");
  const [hash, setHash] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(
        `/api/backend/trace/verify?orderNo=${encodeURIComponent(orderNo.trim())}&hash=${encodeURIComponent(hash.trim().toLowerCase())}`,
      );
      setResult(
        res.ok
          ? ((await res.json()) as VerifyResult)
          : { authentic: false, reason: "invalid input" },
      );
    } catch {
      setResult({ authentic: false, reason: "network error — try again" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <form onSubmit={submit} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="verify-order">Order reference</Label>
          <Input
            id="verify-order"
            required
            placeholder="ORD-2026-XXXXXXXX"
            value={orderNo}
            onChange={(e) => setOrderNo(e.target.value)}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="verify-hash">Trace hash (64 hex characters)</Label>
          <Input
            id="verify-hash"
            required
            pattern="[0-9a-fA-F]{64}"
            placeholder="e3b0c44298fc1c14…"
            value={hash}
            onChange={(e) => setHash(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={busy}>
          {busy ? "Checking the ledger…" : "Verify"}
        </Button>
      </form>
      {result && (
        <div
          className={`rounded-xl border p-4 ${result.authentic ? "border-success/40 bg-success/5" : "border-destructive/40 bg-destructive/5"}`}
        >
          {result.authentic ? (
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-5 text-success" />
              <div className="text-sm">
                <p className="font-semibold">Authentic — event verified on an intact ledger.</p>
                <p className="mt-1 text-muted-foreground">
                  Event <Badge variant="outline">{result.eventType}</Badge> · position {result.seq}/
                  {result.chainLength} · recorded{" "}
                  {result.recordedAt ? new Date(result.recordedAt).toLocaleString() : ""}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <ShieldX className="mt-0.5 size-5 text-destructive" />
              <div className="text-sm">
                <p className="font-semibold">Not verified.</p>
                <p className="mt-1 text-muted-foreground">
                  {result.reason ?? "The hash does not belong to this order's ledger."}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
