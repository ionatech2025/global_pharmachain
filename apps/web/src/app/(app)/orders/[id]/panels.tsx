"use client";

import {
  nextOrderStatus,
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  type OrderStatus,
  orderStatusIndex,
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
import { CalendarClock, MessageSquare, PackageCheck, Truck, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api/browser";
import { ApiClientError, errorMessage } from "@/lib/api/http";
import type { OrderDetail } from "@/lib/api/types";
import { type StatusMode, statusModeFor } from "./status-mode";

function toIsoOrUndefined(dateInput: string): string | undefined {
  return dateInput ? new Date(`${dateInput}T12:00:00Z`).toISOString() : undefined;
}

const MODE_COPY: Record<
  StatusMode,
  { title: string; description: string; noteLabel: string; placeholder: string; submit: string }
> = {
  advance: {
    title: "Update shipment status",
    description:
      "Stages move strictly forward, one at a time. The buyer is notified on every change.",
    noteLabel: "Note",
    placeholder: "e.g. Collected by forwarder, AWB 123-45678901",
    submit: "Update status",
  },
  confirm: {
    title: "Confirm delivery",
    description:
      "Confirm the goods arrived as ordered. This completes the order (stage 13 of 13) and tells the supplier and logistics partners. If something is wrong, raise a dispute instead.",
    noteLabel: "Note",
    placeholder: "e.g. Received in full, seals intact",
    submit: "Confirm delivery",
  },
  correct: {
    title: "Correct shipment status",
    description:
      "Platform corrections may set any stage. Your reason is recorded in the audit log and every party on the order is notified.",
    noteLabel: "Reason for the correction",
    placeholder: "e.g. Advanced to Departed by mistake — goods are still at customs",
    submit: "Apply correction",
  },
};

/** Advance to the next stage with a note (US-701), confirm receipt (buyer,
 *  stage 13), or — super admins — correct to any stage with a reason (TC4).
 *
 *  The target stage is captured when the dialog opens. It used to be captured
 *  once, when the page first rendered: after one update the button said
 *  "Advance to In transit" while the form still held "Goods collected", and the
 *  API answered "Cannot move from Goods collected to Goods collected" until a
 *  manual reload (client review 2026-11-12, Figure 10). */
export function StatusUpdateButton({ order }: { order: OrderDetail }) {
  const router = useRouter();
  const mode = statusModeFor(order);
  const next = nextOrderStatus(order.status);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<OrderStatus | "">("");
  const [note, setNote] = useState("");
  const [eta, setEta] = useState("");
  const [busy, setBusy] = useState(false);

  if (!mode) return null;
  const copy = MODE_COPY[mode];
  const reasonMissing = mode === "correct" && note.trim().length < 5;

  function onOpenChange(nextOpen: boolean) {
    if (nextOpen) {
      // Fresh from the order as it is now, every time.
      const currentIndex = orderStatusIndex(order.status);
      setTarget(
        mode === "correct" ? (next ?? ORDER_STATUSES[currentIndex - 1] ?? "") : (next ?? ""),
      );
      setNote("");
      setEta("");
    }
    setOpen(nextOpen);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!target || reasonMissing) return;
    setBusy(true);
    try {
      await api.post(`/orders/${order.id}/status`, {
        status: target,
        note: note.trim() || undefined,
        eta: mode === "confirm" ? undefined : toIsoOrUndefined(eta),
      });
      toast.success(
        mode === "confirm"
          ? "Delivery confirmed — the order is complete and the supplier is notified"
          : mode === "correct"
            ? `Status corrected to ${ORDER_STATUS_LABELS[target]} — recorded in the audit log, every party notified`
            : `Status updated to ${ORDER_STATUS_LABELS[target]} — the buyer is notified`,
      );
      setOpen(false);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
      // Someone else moved the order first: show them where it is now.
      if (err instanceof ApiClientError && err.status === 409) {
        setOpen(false);
        router.refresh();
      }
    } finally {
      setBusy(false);
    }
  }

  const Icon = mode === "confirm" ? PackageCheck : mode === "correct" ? Wrench : Truck;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant={mode === "correct" ? "outline" : "default"}>
          <Icon className="size-4" />
          {mode === "confirm"
            ? "Confirm delivery"
            : mode === "correct"
              ? "Correct status"
              : `Advance to ${next ? ORDER_STATUS_LABELS[next] : ""}`}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          {mode === "correct" ? (
            <>
              <p className="text-sm">
                Current stage:{" "}
                <span className="font-medium">
                  {orderStatusIndex(order.status) + 1}. {ORDER_STATUS_LABELS[order.status]}
                </span>
              </p>
              <div className="grid gap-2">
                <Label htmlFor="status">Correct to</Label>
                <select
                  id="status"
                  className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm transition-[border-color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50"
                  value={target}
                  onChange={(e) => setTarget(e.target.value as OrderStatus)}
                >
                  {ORDER_STATUSES.map((s, i) =>
                    s === order.status ? null : (
                      <option key={s} value={s}>
                        {i + 1}. {ORDER_STATUS_LABELS[s]}
                      </option>
                    ),
                  )}
                </select>
              </div>
            </>
          ) : (
            <div className="grid gap-2">
              <Label htmlFor="status">New stage</Label>
              <Input
                id="status"
                value={
                  target ? `${orderStatusIndex(target) + 1}. ${ORDER_STATUS_LABELS[target]}` : ""
                }
                disabled
              />
            </div>
          )}
          <div className="grid gap-2">
            <Label htmlFor="note">{copy.noteLabel}</Label>
            <Textarea
              id="note"
              rows={3}
              maxLength={500}
              required={mode === "correct"}
              minLength={mode === "correct" ? 5 : undefined}
              placeholder={copy.placeholder}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
            {mode === "correct" && (
              <p className="text-xs text-muted-foreground">
                Required, at least 5 characters. Shown to the parties in the status history.
              </p>
            )}
          </div>
          {mode !== "confirm" && (
            <div className="grid gap-2">
              <Label htmlFor="status-eta">New ETA (optional)</Label>
              <Input
                id="status-eta"
                type="date"
                value={eta}
                onChange={(e) => setEta(e.target.value)}
              />
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={busy || !target || reasonMissing}>
              {busy ? "Saving…" : copy.submit}
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

  // Reseed on every open: the page follows the order live, so the ETA another
  // party just set must be what this form starts from, not the first render's.
  function onOpenChange(nextOpen: boolean) {
    if (nextOpen) setEta(order.eta ? order.eta.slice(0, 10) : "");
    setOpen(nextOpen);
  }

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
    <Dialog open={open} onOpenChange={onOpenChange}>
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
