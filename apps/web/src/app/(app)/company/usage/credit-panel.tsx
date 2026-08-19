"use client";

import {
  CREDIT_KIND_LABELS,
  CREDIT_KINDS,
  type CreditKind,
  PAYMENT_METHOD_LABELS,
  type PaymentMethod,
  type SubscriptionTier,
} from "@pharmachain/core";
import { Button } from "@pharmachain/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pharmachain/ui/components/card";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@pharmachain/ui/components/table";
import { CreditCard } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CreditStatusBadge } from "@/components/status-badge";
import { api } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/http";
import type { CreditRequestRow } from "@/lib/api/types";

/** GET /billing/payment-methods — what this deployment can actually settle. */
interface EnabledMethod {
  method: PaymentMethod;
  sandbox: boolean;
}

import { fmtDate, fmtMoney } from "@/lib/format";

/**
 * In-platform billing (US-907, QA round 2): request credits → pay here → the
 * confirmation raises this month's effective limit. Card and mobile money
 * confirm automatically on the provider webhook; bank transfer and escrow show
 * a quotable reference and are confirmed by the platform team. Money between
 * two trading companies stays off-platform, by design.
 */
export function CreditRequestPanel({
  credits,
  canRequest,
  tier,
}: {
  credits: CreditRequestRow[];
  canRequest: boolean;
  tier: SubscriptionTier;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<CreditKind>("RFQ");
  const [count, setCount] = useState("5");
  const [busy, setBusy] = useState(false);
  // US-907: the configured fee is displayed at the point of request.
  const [fees, setFees] = useState<{
    rfq: string;
    quotation: string;
    featured: string;
    verificationPremium: string;
    insights: string;
    currency: string;
  } | null>(null);
  useEffect(() => {
    api
      .get<{
        rfq: string;
        quotation: string;
        featured: string;
        verificationPremium: string;
        insights: string;
        currency: string;
      }>("/billing/credit-fees")
      .then(setFees)
      .catch(() => setFees(null));
  }, []);
  // Phase 4 §3: featured placement + premium verification are flat purchases
  // through the same manual-payment flow; usage credits price per unit.
  const flat = kind !== "RFQ" && kind !== "QUOTATION";
  const FEE_KEY = {
    RFQ: "rfq",
    QUOTATION: "quotation",
    FEATURED: "featured",
    VERIFICATION_PREMIUM: "verificationPremium",
    DATA_INSIGHTS: "insights",
  } as const;
  const feePerCredit = fees ? fees[FEE_KEY[kind]] : null;
  const parsedCount = flat ? 1 : Number.parseInt(count, 10);
  const feeDue =
    feePerCredit !== null && Number.isFinite(parsedCount) && parsedCount > 0
      ? (Number.parseFloat(feePerCredit) * parsedCount).toFixed(2)
      : null;
  // Usage credits only make sense on Freemium; the flat purchases (featured,
  // premium verification, data insights) are open to every tier.
  const availableKinds = CREDIT_KINDS.filter(
    (k) => tier === "FREEMIUM" || (k !== "RFQ" && k !== "QUOTATION"),
  );

  async function request(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const created = await api.post<CreditRequestRow>("/billing/credit-requests", {
        kind,
        count: Number(count),
      });
      toast.success(
        `Request created — fee ${fmtMoney(created.fee, created.currency)}. Pay it below to activate the credits.`,
      );
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Extra credits</CardTitle>
        <CardDescription>
          {tier === "FREEMIUM"
            ? "Buy additional monthly credits, 30 days of featured placement, or the premium verification package."
            : "Your plan is unmetered — featured placement and verification packages are still available."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {canRequest && (
          <form onSubmit={request} className="flex flex-wrap items-end gap-2">
            <select
              aria-label="Credit type"
              className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm transition-[border-color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50"
              value={kind}
              onChange={(e) => setKind(e.target.value as CreditKind)}
            >
              {availableKinds.map((k) => (
                <option key={k} value={k}>
                  {CREDIT_KIND_LABELS[k]}
                </option>
              ))}
            </select>
            {!flat && (
              <Input
                className="w-24"
                type="number"
                min={1}
                max={100}
                required
                value={count}
                onChange={(e) => setCount(e.target.value)}
              />
            )}
            <Button type="submit" disabled={busy}>
              {busy ? "Submitting…" : flat ? "Purchase" : "Request credits"}
            </Button>
            {fees && feeDue && (
              <p className="w-full text-xs text-muted-foreground">
                Fee due:{" "}
                <span className="font-medium text-foreground">
                  {fmtMoney(feeDue, fees.currency)}
                </span>{" "}
                {flat
                  ? "(one-off)"
                  : `(${fmtMoney(feePerCredit ?? "0", fees.currency)} per credit)`}{" "}
                — pay it here as soon as the request is created.
              </p>
            )}
          </form>
        )}

        {credits.length === 0 ? (
          <p className="text-sm text-muted-foreground">No credit requests yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Requested</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Credits</TableHead>
                <TableHead>Fee</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {credits.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{fmtDate(c.createdAt)}</TableCell>
                  <TableCell>{CREDIT_KIND_LABELS[c.kind as CreditKind] ?? c.kind}</TableCell>
                  <TableCell>{c.count}</TableCell>
                  <TableCell>{fmtMoney(c.fee, c.currency)}</TableCell>
                  <TableCell>
                    <CreditStatusBadge status={c.status} />
                  </TableCell>
                  <TableCell className="text-right">
                    {c.status === "PENDING_PAYMENT" && <PayFeeDialog request={c} />}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * In-platform checkout for one pending fee.
 *
 * Two shapes behind one button, because the settlement differs: card and
 * mobile money hand off to the provider and confirm on its webhook, so the
 * dialog just says "watch this space"; bank transfer and escrow produce a
 * reference to quote, and the payer tells us once they have sent it — which
 * queues it for the platform team rather than granting anything.
 */
function PayFeeDialog({ request }: { request: CreditRequestRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [methods, setMethods] = useState<EnabledMethod[] | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("BANK_TRANSFER");
  const [instructions, setInstructions] = useState<string | null>(
    request.paymentInstructions ?? null,
  );
  const [reference, setReference] = useState<string | null>(request.paymentRef ?? null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || methods) return;
    api
      .get<EnabledMethod[]>("/billing/payment-methods")
      .then((m) => {
        setMethods(m);
        if (m[0]) setMethod(m[0].method);
      })
      .catch(() => setMethods([]));
  }, [open, methods]);

  const selfConfirming = method === "CARD" || method === "MOBILE_MONEY";

  async function startPayment() {
    setBusy(true);
    try {
      const result = await api.post<{ request: CreditRequestRow; instructions: string }>(
        `/billing/credit-requests/${request.id}/pay`,
        { method },
      );
      setInstructions(result.instructions);
      setReference(result.request.paymentRef ?? null);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function declarePaid() {
    setBusy(true);
    try {
      await api.post(`/billing/credit-requests/${request.id}/declare-paid`);
      toast.success("Thanks — the platform team will confirm once the funds land.");
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <CreditCard className="size-3.5" /> Pay {fmtMoney(request.fee, request.currency)}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pay platform fee</DialogTitle>
          <DialogDescription>
            {fmtMoney(request.fee, request.currency)} for {request.count}{" "}
            {CREDIT_KIND_LABELS[request.kind as CreditKind] ?? request.kind}. Credits activate as
            soon as the payment is confirmed.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3">
          <div className="grid gap-2">
            <Label htmlFor={`method-${request.id}`}>Payment method</Label>
            <select
              id={`method-${request.id}`}
              className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm transition-[border-color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50"
              value={method}
              disabled={busy || methods === null}
              onChange={(e) => {
                setMethod(e.target.value as PaymentMethod);
                setInstructions(null);
                setReference(null);
              }}
            >
              {(methods ?? []).map((m) => (
                <option key={m.method} value={m.method}>
                  {PAYMENT_METHOD_LABELS[m.method]}
                  {m.sandbox ? " (sandbox)" : ""}
                </option>
              ))}
            </select>
            {methods?.length === 0 && (
              <p className="text-xs text-destructive">
                No payment method is enabled on this deployment — contact the platform team.
              </p>
            )}
          </div>

          {instructions && (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <p className="whitespace-pre-wrap">{instructions}</p>
              {reference && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Reference: <span className="font-mono text-foreground">{reference}</span>
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          {!instructions ? (
            <Button
              onClick={startPayment}
              disabled={busy || methods === null || methods.length === 0}
            >
              {busy ? "Starting…" : "Continue"}
            </Button>
          ) : selfConfirming ? (
            <Button variant="outline" onClick={() => setOpen(false)}>
              Done — awaiting confirmation
            </Button>
          ) : (
            <Button onClick={declarePaid} disabled={busy}>
              {busy ? "Sending…" : "I have sent this payment"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
