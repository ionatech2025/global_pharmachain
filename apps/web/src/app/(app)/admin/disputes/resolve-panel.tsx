"use client";

import { DISPUTE_STATUS_LABELS } from "@pharmachain/core";
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
import { Label } from "@pharmachain/ui/components/label";
import { Textarea } from "@pharmachain/ui/components/textarea";
import { Gavel } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/http";
import type { DisputeRow } from "@/lib/api/types";

export function AdminDisputeStatusBadge({ status }: { status: DisputeRow["status"] }) {
  const variant =
    status === "OPEN"
      ? ("warning" as const)
      : status === "ESCALATED"
        ? ("destructive" as const)
        : status === "RESOLVED"
          ? ("success" as const)
          : ("secondary" as const);
  return <Badge variant={variant}>{DISPUTE_STATUS_LABELS[status]}</Badge>;
}

export function AdminDisputeActions({ dispute }: { dispute: DisputeRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [resolution, setResolution] = useState("");
  const [busy, setBusy] = useState(false);

  if (dispute.status === "RESOLVED" || dispute.status === "WITHDRAWN") return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post(`/admin/disputes/${dispute.id}/resolve`, { resolution });
      toast.success("Dispute resolved — all parties notified");
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
        <Button size="sm">
          <Gavel className="size-4" /> Resolve
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Resolve dispute</DialogTitle>
          <DialogDescription>
            "{dispute.subject}" — your resolution is sent to every shipment party and recorded on
            the audit trail.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="resolution">Resolution</Label>
            <Textarea
              id="resolution"
              rows={4}
              required
              minLength={5}
              maxLength={2000}
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={busy || resolution.trim().length < 5}>
              {busy ? "Resolving…" : "Resolve dispute"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
