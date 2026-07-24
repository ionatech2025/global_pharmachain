"use client";

import { PAYMENT_METHOD_LABELS, type PaymentMethod } from "@pharmachain/core";
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
import { Textarea } from "@pharmachain/ui/components/textarea";
import { BadgeCheck, Banknote, ReceiptText, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/http";
import type { PaymentRow } from "@/lib/api/types";
import { fmtMoney } from "@/lib/format";

const inputClass =
  "h-10 rounded-lg border border-input bg-transparent px-3 text-sm transition-[border-color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25";

export function PaymentStatusBadge({ status }: { status: PaymentRow["status"] }) {
  const variant =
    status === "CONFIRMED"
      ? ("success" as const)
      : status === "PENDING"
        ? ("warning" as const)
        : ("destructive" as const);
  return <Badge variant={variant}>{status.charAt(0) + status.slice(1).toLowerCase()}</Badge>;
}

/** Buyer: initiate a (partial) payment; manual transfers show instructions. */
export function RecordPaymentButton({
  orderId,
  currency,
  balance,
}: {
  orderId: string;
  currency: string;
  balance: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("BANK_TRANSFER");
  // Only methods something can actually settle are offered (review finding:
  // dead-end payments); sandbox-backed ones are labelled as such.
  const [enabled, setEnabled] = useState<Array<{ method: PaymentMethod; sandbox: boolean }>>([
    { method: "BANK_TRANSFER", sandbox: false },
  ]);
  useEffect(() => {
    api
      .get<Array<{ method: PaymentMethod; sandbox: boolean }>>("/payments/methods")
      .then(setEnabled)
      .catch(() => {});
  }, []);
  const [amount, setAmount] = useState(balance > 0 ? balance.toFixed(2) : "");
  const [note, setNote] = useState("");
  const [instructions, setInstructions] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await api.post<{ instructions: string }>(`/orders/${orderId}/payments`, {
        method,
        amount: Number(amount),
        note: note || undefined,
      });
      setInstructions(result.instructions);
      toast.success("Payment initiated");
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
        if (!next) setInstructions(null);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" disabled={balance <= 0}>
          <Banknote className="size-4" /> Record payment
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record a payment</DialogTitle>
          <DialogDescription>
            Payments settle directly between the parties — the platform never holds funds. Partial
            amounts are fine; the balance tracks every confirmed instalment.
          </DialogDescription>
        </DialogHeader>
        {instructions ? (
          <div className="space-y-4">
            <p className="rounded-lg border bg-muted/40 p-3 text-sm">{instructions}</p>
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="pay-method">Method</Label>
              <select
                id="pay-method"
                className={inputClass}
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              >
                {enabled.map((m) => (
                  <option key={m.method} value={m.method}>
                    {PAYMENT_METHOD_LABELS[m.method]}
                    {m.sandbox ? " (sandbox)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pay-amount">Amount ({currency})</Label>
              <Input
                id="pay-amount"
                type="number"
                min="0.01"
                step="0.01"
                max={balance}
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Outstanding balance: {fmtMoney(balance, currency)}
              </p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pay-note">Note (optional)</Label>
              <Textarea
                id="pay-note"
                rows={2}
                maxLength={300}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy || !amount}>
                {busy ? "Initiating…" : "Initiate payment"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Payee: confirm receipt / reject a pending payment. */
export function PaymentActions({
  payment,
  viewerIsSeller,
  viewerIsBuyer,
}: {
  payment: PaymentRow;
  viewerIsSeller: boolean;
  viewerIsBuyer: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  if (payment.status !== "PENDING") return null;

  async function act(path: string, body: Record<string, unknown>, message: string) {
    setBusy(true);
    try {
      await api.post(path, body);
      toast.success(message);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-1.5">
      {viewerIsSeller && (
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() =>
            act(`/payments/${payment.id}/confirm`, {}, "Receipt confirmed — ledgers updated")
          }
        >
          <BadgeCheck className="size-3.5" /> Confirm receipt
        </Button>
      )}
      {(viewerIsSeller || viewerIsBuyer) && (
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() =>
            act(
              `/payments/${payment.id}/fail`,
              { reason: viewerIsSeller ? "Rejected by payee" : "Cancelled by payer" },
              "Payment marked failed",
            )
          }
        >
          <X className="size-3.5" />
        </Button>
      )}
    </div>
  );
}

/** Seller: issue the order invoice (duty/VAT from the tax rules). */
export function IssueInvoiceButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [hsCode, setHsCode] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const invoice = await api.post<{ invoiceNo: string }>(`/orders/${orderId}/invoice`, {
        ...(hsCode ? { hsCode } : {}),
      });
      toast.success(`Invoice ${invoice.invoiceNo} issued — the buyer is notified`);
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
          <ReceiptText className="size-4" /> Issue invoice
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Issue the order invoice</DialogTitle>
          <DialogDescription>
            Sequential number, duty and VAT applied automatically from the platform tax rules for
            this HS code and lane, FX rate stamped, PDF stored with the order documents.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="inv-hs">HS code (optional — detected from your catalogue)</Label>
            <Input
              id="inv-hs"
              placeholder="e.g. 293626"
              pattern="\d{4,10}"
              value={hsCode}
              onChange={(e) => setHsCode(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy}>
              {busy ? "Issuing…" : "Issue invoice"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
