"use client";

import {
  nextOrderStatus,
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  type OrderStatus,
} from "@pharmachain/core";
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
import { CalendarClock, MessageSquare, Truck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/http";
import type { OrderDetail } from "@/lib/api/types";

function toIsoOrUndefined(dateInput: string): string | undefined {
  return dateInput ? new Date(`${dateInput}T12:00:00Z`).toISOString() : undefined;
}

/** Seller: advance to the next stage with a note (US-701); optionally set a
 *  new ETA in the same update. Super admins may correct to any stage. */
export function StatusUpdateButton({
  order,
  isSuperAdmin,
}: {
  order: OrderDetail;
  isSuperAdmin: boolean;
}) {
  const router = useRouter();
  const next = nextOrderStatus(order.status);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<OrderStatus | "">(next ?? "");
  const [note, setNote] = useState("");
  const [eta, setEta] = useState("");
  const [busy, setBusy] = useState(false);

  if (!next && !isSuperAdmin) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!status) return;
    setBusy(true);
    try {
      await api.post(`/orders/${order.id}/status`, {
        status,
        note: note || undefined,
        eta: toIsoOrUndefined(eta),
      });
      toast.success(`Status updated to ${ORDER_STATUS_LABELS[status]} — the buyer is notified`);
      setOpen(false);
      setNote("");
      setEta("");
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
        <Button size="sm">
          <Truck className="size-4" />
          {next ? `Advance to ${ORDER_STATUS_LABELS[next]}` : "Correct status"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update shipment status</DialogTitle>
          <DialogDescription>
            {isSuperAdmin
              ? "Super-admin corrections may target any stage and are audited."
              : "Stages move strictly forward, one at a time. The buyer is notified on every change."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="status">New stage</Label>
            {isSuperAdmin ? (
              <select
                id="status"
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
                value={status}
                onChange={(e) => setStatus(e.target.value as OrderStatus)}
              >
                {ORDER_STATUSES.filter((s) => s !== order.status).map((s) => (
                  <option key={s} value={s}>
                    {ORDER_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            ) : (
              <Input id="status" value={next ? ORDER_STATUS_LABELS[next] : ""} disabled />
            )}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="note">Note</Label>
            <Textarea
              id="note"
              rows={3}
              maxLength={500}
              placeholder="e.g. Collected by forwarder, AWB 123-45678901"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="status-eta">New ETA (optional)</Label>
            <Input
              id="status-eta"
              type="date"
              value={eta}
              onChange={(e) => setEta(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy || !status}>
              {busy ? "Updating…" : "Update status"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Seller: set/adjust the estimated arrival date at any time (US-703). */
export function EtaButton({ order }: { order: OrderDetail }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [eta, setEta] = useState(order.eta ? order.eta.slice(0, 10) : "");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const iso = toIsoOrUndefined(eta);
    if (!iso) return;
    setBusy(true);
    try {
      await api.patch(`/orders/${order.id}/eta`, { eta: iso });
      toast.success("ETA updated — the buyer is notified");
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
          <CalendarClock className="size-4" /> {order.eta ? "Update ETA" : "Set ETA"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Estimated arrival</DialogTitle>
          <DialogDescription>The buyer sees the ETA on their progress tracker.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="eta">ETA</Label>
            <Input
              id="eta"
              type="date"
              required
              value={eta}
              onChange={(e) => setEta(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy || !eta}>
              {busy ? "Saving…" : "Save ETA"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Opens (lazily creating) the single message thread for this order (US-601). */
export function MessageCounterpartyButton({
  orderId,
  counterpartyName,
}: {
  orderId: string;
  counterpartyName: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function open() {
    setBusy(true);
    try {
      const thread = await api.post<{ id: string }>("/threads/lookup", { orderId });
      router.push(`/messages/${thread.id}`);
    } catch (err) {
      toast.error(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant="outline" onClick={open} disabled={busy}>
      <MessageSquare className="size-4" /> Message {counterpartyName}
    </Button>
  );
}
