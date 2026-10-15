"use client";

import {
  ISSUE_PRIORITIES,
  ISSUE_PRIORITY_LABELS,
  ISSUE_STATUS_LABELS,
  ISSUE_STATUSES,
  type IssuePriority,
  type IssueStatus,
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
import { Label } from "@pharmachain/ui/components/label";
import { Textarea } from "@pharmachain/ui/components/textarea";
import { Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/http";
import type { SupportIssueRow } from "@/lib/api/types";

export function AdminIssueActions({ issue }: { issue: SupportIssueRow }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<IssueStatus>(issue.status);
  const [priority, setPriority] = useState<IssuePriority>(issue.priority);
  const [resolution, setResolution] = useState(issue.resolution ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.patch(`/admin/issues/${issue.id}`, {
        status,
        priority,
        resolution: resolution.trim(),
      });
      toast.success(`Issue ${issue.refNo} updated — reporter notified`);
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
        <Button size="sm" variant={issue.status === "OPEN" ? "default" : "outline"}>
          <Wrench className="size-3.5" /> Triage / resolve
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Triage {issue.refNo}</DialogTitle>
          <DialogDescription>
            “{issue.subject}” — updates notify {issue.reportedBy.name} ({issue.reportedBy.email})
            and are recorded on the platform audit trail.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-1 gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor={`status-${issue.id}`}>Status</Label>
              <select
                id={`status-${issue.id}`}
                value={status}
                onChange={(e) => setStatus(e.target.value as IssueStatus)}
                className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm"
              >
                {ISSUE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {ISSUE_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`priority-${issue.id}`}>Priority</Label>
              <select
                id={`priority-${issue.id}`}
                value={priority}
                onChange={(e) => setPriority(e.target.value as IssuePriority)}
                className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm"
              >
                {ISSUE_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {ISSUE_PRIORITY_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`resolution-${issue.id}`}>Resolution / development team note</Label>
            <Textarea
              id={`resolution-${issue.id}`}
              rows={4}
              maxLength={4000}
              placeholder="Explain the fix, workaround, or next steps for the user…"
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Update ticket"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
