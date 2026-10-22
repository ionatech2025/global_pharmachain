"use client";

import {
  ISSUE_PRIORITIES,
  ISSUE_PRIORITY_LABELS,
  ISSUE_STATUS_LABELS,
  ISSUE_STATUSES,
  type IssuePriority,
  type IssueStatus,
} from "@pharmachain/core";
import { Badge } from "@pharmachain/ui/components/badge";
import { Button } from "@pharmachain/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pharmachain/ui/components/card";
import { Label } from "@pharmachain/ui/components/label";
import { Textarea } from "@pharmachain/ui/components/textarea";
import { CheckCircle2, RotateCcw, Send, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/http";
import type { SupportIssueDetail } from "@/lib/api/types";
import { fmtDateTime } from "@/lib/format";

export function IssueThread({
  issue,
  isSuperAdmin,
}: {
  issue: SupportIssueDetail;
  isSuperAdmin: boolean;
}) {
  const router = useRouter();
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [togglingStatus, setTogglingStatus] = useState(false);

  // Admin triage state
  const [status, setStatus] = useState<IssueStatus>(issue.status);
  const [priority, setPriority] = useState<IssuePriority>(issue.priority);
  const [resolution, setResolution] = useState(issue.resolution ?? "");
  const [savingAdmin, setSavingAdmin] = useState(false);

  async function sendReply(e: React.FormEvent) {
    e.preventDefault();
    if (reply.trim().length < 2) return;
    setSending(true);
    try {
      await api.post(`/issues/${issue.id}/messages`, { body: reply.trim() });
      toast.success("Reply posted");
      setReply("");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSending(false);
    }
  }

  async function toggleOwnStatus(next: "OPEN" | "CLOSED") {
    setTogglingStatus(true);
    try {
      await api.post(`/issues/${issue.id}/status`, { status: next });
      toast.success(next === "CLOSED" ? "Ticket closed" : "Ticket reopened");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setTogglingStatus(false);
    }
  }

  async function saveAdminTriage(e: React.FormEvent) {
    e.preventDefault();
    setSavingAdmin(true);
    try {
      await api.patch(`/admin/issues/${issue.id}`, {
        status,
        priority,
        resolution: resolution.trim(),
      });
      toast.success("Ticket updated — reporter notified");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSavingAdmin(false);
    }
  }

  const isClosed = issue.status === "CLOSED" || issue.status === "RESOLVED";

  return (
    <div className="space-y-4">
      {isSuperAdmin && (
        <Card className="border-primary/30 bg-primary/[0.03]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <ShieldCheck className="size-4 text-primary" />
              Development team triage & resolution
            </CardTitle>
            <CardDescription>
              Update status, priority or record the official resolution. Saving notifies the
              reporting user and logs to the audit trail.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={saveAdminTriage} className="grid grid-cols-1 gap-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="admin-issue-status">Status</Label>
                  <select
                    id="admin-issue-status"
                    value={status}
                    onChange={(e) => setStatus(e.target.value as IssueStatus)}
                    className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
                  >
                    {ISSUE_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {ISSUE_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="admin-issue-priority">Priority</Label>
                  <select
                    id="admin-issue-priority"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as IssuePriority)}
                    className="h-10 rounded-lg border border-input bg-background px-3 text-sm"
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
                <Label htmlFor="admin-issue-resolution">Resolution / development team note</Label>
                <Textarea
                  id="admin-issue-resolution"
                  rows={3}
                  maxLength={4000}
                  placeholder="Describe the fix, workaround, or action taken by the development team…"
                  value={resolution}
                  onChange={(e) => setResolution(e.target.value)}
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" size="sm" disabled={savingAdmin}>
                  {savingAdmin ? "Saving…" : "Save triage update"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Conversation timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Discussion & updates ({issue.messages.length})</CardTitle>
          <CardDescription>
            Replies between your team and the Global PharmaChain development team.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {issue.messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No replies yet. Add additional details below if needed.
            </p>
          ) : (
            <ul className="space-y-3" aria-live="polite">
              {issue.messages.map((msg) => {
                const fromStaff = msg.isStaff || msg.author.isSuperAdmin;
                return (
                  <li
                    key={msg.id}
                    className={`rounded-xl border p-3.5 text-sm ${
                      fromStaff ? "border-primary/30 bg-primary/[0.04]" : "bg-muted/30"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{msg.author.name}</span>
                        {fromStaff ? (
                          <Badge variant="info">Development team</Badge>
                        ) : (
                          <Badge variant="outline">Reporter</Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {fmtDateTime(msg.createdAt)}
                      </span>
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-foreground/90">{msg.body}</p>
                  </li>
                );
              })}
            </ul>
          )}

          <form onSubmit={sendReply} className="space-y-3 border-t pt-4">
            <div className="grid gap-1.5">
              <Label htmlFor="issue-reply">Add a reply</Label>
              <Textarea
                id="issue-reply"
                rows={3}
                minLength={2}
                maxLength={4000}
                placeholder={
                  isSuperAdmin
                    ? "Reply as the development team…"
                    : "Share additional details, steps to reproduce, or follow-up questions…"
                }
                value={reply}
                onChange={(e) => setReply(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              {!isSuperAdmin ? (
                isClosed ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={togglingStatus}
                    onClick={() => toggleOwnStatus("OPEN")}
                  >
                    <RotateCcw className="size-3.5" /> Reopen ticket
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={togglingStatus}
                    onClick={() => toggleOwnStatus("CLOSED")}
                  >
                    <CheckCircle2 className="size-3.5" /> Mark as closed
                  </Button>
                )
              ) : (
                <div />
              )}
              <Button type="submit" size="sm" disabled={sending || reply.trim().length < 2}>
                <Send className="size-3.5" />
                {sending ? "Sending…" : "Send reply"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
