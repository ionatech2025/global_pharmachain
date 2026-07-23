"use client";

import { Button } from "@pharmachain/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@pharmachain/ui/components/dialog";
import { Label } from "@pharmachain/ui/components/label";
import { Textarea } from "@pharmachain/ui/components/textarea";
import { cloneElement, useState } from "react";

interface ConfirmDialogProps {
  /** Element that opens the dialog (rendered as-is, wired via onClick). */
  trigger: React.ReactElement<{ onClick?: () => void }>;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  /** When set, a reason textarea is shown and required (min 5 chars). */
  reasonLabel?: string;
  onConfirm: (reason?: string) => void | Promise<void>;
}

/**
 * The one confirmation pattern for irreversible actions — replaces the mix of
 * window.confirm / window.prompt with a styled dialog that can also collect a
 * required, audited reason.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "Confirm",
  destructive = false,
  reasonLabel,
  onConfirm,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const reasonMissing = Boolean(reasonLabel) && reason.trim().length < 5;

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm(reasonLabel ? reason.trim() : undefined);
      setOpen(false);
      setReason("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {cloneElement(trigger, { onClick: () => setOpen(true) })}
      <Dialog open={open} onOpenChange={(next) => !next && setOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          {reasonLabel && (
            <div className="grid gap-2">
              <Label htmlFor="confirm-reason">{reasonLabel}</Label>
              <Textarea
                id="confirm-reason"
                rows={3}
                required
                minLength={5}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              {reasonMissing && reason.length > 0 && (
                <p className="text-xs text-destructive">At least 5 characters</p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant={destructive ? "destructive" : "default"}
              onClick={confirm}
              disabled={busy || reasonMissing}
            >
              {busy ? "Working…" : confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
