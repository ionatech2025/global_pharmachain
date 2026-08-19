"use client";

import { CURRENCIES } from "@pharmachain/core";
import { Badge } from "@pharmachain/ui/components/badge";
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
import { Textarea } from "@pharmachain/ui/components/textarea";
import { MessageSquare } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { AttachmentPicker } from "@/components/attachment-picker";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DocumentChip } from "@/components/document-chip";
import { QuotationStatusBadge } from "@/components/status-badge";
import { api } from "@/lib/api/browser";
import { ApiClientError, errorMessage } from "@/lib/api/http";
import type { QuotationRow, RfqDetail } from "@/lib/api/types";
import { fmtDate, fmtMoney } from "@/lib/format";

export function CancelRfqButton({ rfqId }: { rfqId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function cancel() {
    setBusy(true);
    try {
      await api.post(`/rfqs/${rfqId}/cancel`);
      toast.success("RFQ cancelled");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConfirmDialog
      trigger={
        <Button variant="destructive" size="sm" disabled={busy}>
          Cancel RFQ
        </Button>
      }
      title="Cancel this RFQ?"
      description="Responding suppliers will be notified and the RFQ becomes read-only. This cannot be undone."
      confirmLabel="Cancel RFQ"
      destructive
      onConfirm={cancel}
    />
  );
}

async function openThread(
  router: ReturnType<typeof useRouter>,
  lookup: { rfqId: string; supplierCompanyId?: string },
) {
  try {
    const thread = await api.post<{ id: string }>("/threads/lookup", lookup);
    router.push(`/messages/${thread.id}`);
  } catch (err) {
    toast.error(errorMessage(err));
  }
}

// ─── Buyer: quotation comparison + award (US-404/405) ────────────────────────

export function BuyerQuotations({
  rfqId,
  rfqStatus,
  quantity,
  unit,
  initial,
}: {
  rfqId: string;
  rfqStatus: string;
  quantity: string;
  unit: string;
  initial: QuotationRow[];
}) {
  const router = useRouter();
  const [quotations, setQuotations] = useState(initial);
  const [sort, setSort] = useState<"price" | "leadTime">("price");
  const [accepting, setAccepting] = useState<QuotationRow | null>(null);
  const canAward = rfqStatus === "OPEN" || rfqStatus === "CLOSED";

  async function resort(next: "price" | "leadTime") {
    setSort(next);
    setQuotations(
      await api.get<QuotationRow[]>(`/rfqs/${rfqId}/quotations`, { query: { sort: next } }),
    );
  }

  async function accept() {
    if (!accepting) return;
    try {
      const order = await api.post<{ id: string; orderNo: string }>(
        `/quotations/${accepting.id}/accept`,
      );
      toast.success(`Order ${order.orderNo} confirmed`);
      router.push(`/orders/${order.id}`);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
      setAccepting(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm">Quotations ({quotations.length})</CardTitle>
          <CardDescription>Latest version per supplier; withdrawn/expired marked.</CardDescription>
        </div>
        {/* Nothing to sort with an empty table — the controls read as live
            actions otherwise, which QA flagged on a zero-quotation RFQ. */}
        <div className="flex gap-1 text-xs">
          <Button
            size="sm"
            disabled={quotations.length === 0}
            variant={sort === "price" ? "secondary" : "ghost"}
            onClick={() => resort("price")}
          >
            By price
          </Button>
          <Button
            size="sm"
            disabled={quotations.length === 0}
            variant={sort === "leadTime" ? "secondary" : "ghost"}
            onClick={() => resort("leadTime")}
          >
            By lead time
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {quotations.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No quotations yet — suppliers see this RFQ in their inbox until the deadline.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Supplier</TableHead>
                <TableHead>Unit price</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Lead time</TableHead>
                <TableHead>Valid until</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotations.map((q) => {
                // Decision support: flag the best active offer per column.
                const active = quotations.filter((x) => x.status === "ACTIVE");
                const bestPrice =
                  q.status === "ACTIVE" &&
                  active.length > 1 &&
                  Number.parseFloat(q.totalPrice) ===
                    Math.min(...active.map((x) => Number.parseFloat(x.totalPrice)));
                const fastest =
                  q.status === "ACTIVE" &&
                  active.length > 1 &&
                  q.leadTimeDays === Math.min(...active.map((x) => x.leadTimeDays));
                return (
                  <TableRow key={q.id} className={q.status !== "ACTIVE" ? "opacity-60" : ""}>
                    <TableCell>
                      <Link
                        href={`/companies/${q.supplierCompany.id}`}
                        className="font-medium hover:underline"
                      >
                        {q.supplierCompany.name}
                      </Link>
                      {q.version > 1 && (
                        <Badge variant="outline" className="ml-2">
                          v{q.version}
                        </Badge>
                      )}
                      {q.documents.length > 0 && (
                        <div className="mt-1 space-y-0.5">
                          {q.documents.map((d) => (
                            <DocumentChip key={d.id} id={d.id} fileName={d.fileName} />
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{fmtMoney(q.unitPrice, q.currency)}</TableCell>
                    <TableCell className="font-medium">
                      {fmtMoney(q.totalPrice, q.currency)}
                      {bestPrice && (
                        <Badge variant="success" className="ml-1.5">
                          Best price
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {q.leadTimeDays} days
                      {fastest && (
                        <Badge variant="info" className="ml-1.5">
                          Fastest
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{fmtDate(q.validUntil)}</TableCell>
                    <TableCell>
                      <QuotationStatusBadge status={q.status} />
                    </TableCell>
                    <TableCell className="space-x-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label="Message supplier"
                        onClick={() =>
                          openThread(router, { rfqId, supplierCompanyId: q.supplierCompany.id })
                        }
                      >
                        <MessageSquare className="size-4" />
                      </Button>
                      {canAward && q.status === "ACTIVE" && (
                        <Button size="sm" onClick={() => setAccepting(q)}>
                          Accept
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}

        <Dialog open={accepting !== null} onOpenChange={(open) => !open && setAccepting(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Confirm order</DialogTitle>
              <DialogDescription>
                Accepting {accepting?.supplierCompany.name}'s quotation creates an order for{" "}
                {quantity} {unit} at{" "}
                {accepting ? fmtMoney(accepting.totalPrice, accepting.currency) : ""} total and
                closes this RFQ. Other suppliers will be notified they were not selected.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAccepting(null)}>
                Back
              </Button>
              <Button onClick={accept}>Accept & create order</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// ─── Supplier: submit / resubmit / withdraw (US-403) ─────────────────────────

export function SupplierQuotePanel({ rfq }: { rfq: RfqDetail }) {
  const router = useRouter();
  const existing = rfq.myQuotation;
  const open = rfq.status === "OPEN" && new Date(rfq.deadline) > new Date();
  const [unitPrice, setUnitPrice] = useState(existing?.unitPrice ?? "");
  const [currency, setCurrency] = useState(existing?.currency ?? "USD");
  const [leadTimeDays, setLeadTimeDays] = useState(String(existing?.leadTimeDays ?? 14));
  const [validDays, setValidDays] = useState("30");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [attachmentIds, setAttachmentIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const payload = {
      unitPrice,
      currency,
      leadTimeDays: Number(leadTimeDays),
      validUntil: new Date(Date.now() + Number(validDays) * 24 * 60 * 60 * 1000).toISOString(),
      notes: notes || undefined,
      attachmentDocumentIds: attachmentIds,
    };
    try {
      if (existing && existing.status === "ACTIVE") {
        await api.post(`/quotations/${existing.id}/resubmit`, payload);
        toast.success("Quotation updated — the buyer sees your latest version");
      } else {
        await api.post(`/rfqs/${rfq.id}/quotations`, payload);
        toast.success("Quotation submitted");
      }
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "LIMIT_REACHED") {
        const d = (err.details ?? {}) as { used?: number; limit?: number };
        toast.error(err.message, {
          description:
            d.used !== undefined && d.limit !== undefined
              ? `${d.used} of ${d.limit} used this month. Buy credits for this month or upgrade your plan.`
              : "Buy credits for this month or upgrade your plan.",
          duration: 10000,
          action: { label: "Get credits", onClick: () => router.push("/company/usage") },
          cancel: { label: "Upgrade", onClick: () => router.push("/company/usage") },
        });
      } else {
        toast.error(errorMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  async function withdraw() {
    if (!existing) return;
    try {
      await api.post(`/quotations/${existing.id}/withdraw`);
      toast.success("Quotation withdrawn");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="text-sm">
            {existing
              ? `Your company's quotation (v${existing.version})`
              : "Submit your company's quotation"}
          </CardTitle>
          <CardDescription>
            {open
              ? `This is the offer your company sends ${rfq.buyerCompany.name}. Resubmitting before the deadline replaces your previous version.`
              : "This RFQ is no longer accepting quotations."}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          {existing && <QuotationStatusBadge status={existing.status} />}
          <Button size="sm" variant="ghost" onClick={() => openThread(router, { rfqId: rfq.id })}>
            <MessageSquare className="size-4" /> Message buyer
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="grid gap-2">
              <Label htmlFor="unitPrice">Unit price *</Label>
              <Input
                id="unitPrice"
                inputMode="decimal"
                required
                disabled={!open}
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="currency">Currency</Label>
              <select
                id="currency"
                className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm transition-[border-color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50"
                value={currency}
                disabled={!open}
                onChange={(e) => setCurrency(e.target.value)}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="leadTime">Lead time (days)</Label>
              <Input
                id="leadTime"
                type="number"
                min={1}
                max={365}
                required
                disabled={!open}
                value={leadTimeDays}
                onChange={(e) => setLeadTimeDays(e.target.value)}
              />
            </div>
          </div>
          {unitPrice && !Number.isNaN(Number.parseFloat(unitPrice)) && (
            <p className="text-sm text-muted-foreground">
              Total for {rfq.quantity} {rfq.unit}:{" "}
              <span className="font-medium text-foreground">
                {fmtMoney(
                  (Number.parseFloat(unitPrice) * Number.parseFloat(rfq.quantity)).toFixed(2),
                  currency,
                )}
              </span>
            </p>
          )}
          <div className="grid gap-2">
            <Label htmlFor="validDays">Validity (days from today)</Label>
            <Input
              id="validDays"
              type="number"
              min={1}
              max={180}
              disabled={!open}
              value={validDays}
              onChange={(e) => setValidDays(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              rows={3}
              disabled={!open}
              placeholder="Incoterms, packaging, documentation included…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Attachments (optional)</Label>
            <AttachmentPicker
              kind="QUOTATION_ATTACHMENT"
              value={attachmentIds}
              onChange={setAttachmentIds}
              disabled={!open}
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={!open || busy}>
              {busy
                ? "Sending…"
                : existing?.status === "ACTIVE"
                  ? "Resubmit quotation"
                  : "Submit quotation"}
            </Button>
            {existing?.status === "ACTIVE" && open && (
              <ConfirmDialog
                trigger={
                  <Button type="button" variant="outline">
                    Withdraw
                  </Button>
                }
                title="Withdraw your quotation?"
                description="The buyer will be notified and your offer leaves their comparison."
                confirmLabel="Withdraw"
                destructive
                onConfirm={withdraw}
              />
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
