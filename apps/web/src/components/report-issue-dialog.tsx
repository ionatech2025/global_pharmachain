"use client";

import {
  ISSUE_CATEGORIES,
  ISSUE_CATEGORY_LABELS,
  ISSUE_PRIORITIES,
  ISSUE_PRIORITY_LABELS,
  type IssueCategory,
  type IssuePriority,
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
import { LifeBuoy, Plus } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/http";
import type { SupportIssueRow } from "@/lib/api/types";

export function ReportIssueDialog({
  trigger,
  defaultCategory = "BUG",
  navigateOnCreate = false,
}: {
  trigger?: React.ReactNode;
  defaultCategory?: IssueCategory;
  navigateOnCreate?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<IssueCategory>(defaultCategory);
  const [priority, setPriority] = useState<IssuePriority>("MEDIUM");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [pageUrl, setPageUrl] = useState(pathname || "");
  const [busy, setBusy] = useState(false);

  // Keep captured route in sync with the page the user opened the modal from.
  useEffect(() => {
    if (open) {
      setPageUrl(pathname || "");
    }
  }, [open, pathname]);

  // Allow global custom event (e.g. from CommandMenu ⌘K) to open this modal.
  useEffect(() => {
    const onOpenEvent = () => setOpen(true);
    window.addEventListener("pharmachain:open-issue-dialog", onOpenEvent);
    return () => window.removeEventListener("pharmachain:open-issue-dialog", onOpenEvent);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const created = await api.post<SupportIssueRow>("/issues", {
        category,
        priority,
        subject: subject.trim(),
        description: description.trim(),
        pageUrl: pageUrl.trim() || undefined,
      });
      toast.success(`Ticket ${created.refNo} raised — our development team has been notified.`);
      setOpen(false);
      setSubject("");
      setDescription("");
      setPriority("MEDIUM");
      if (navigateOnCreate) {
        router.push(`/issues/${created.id}`);
      } else {
        router.refresh();
      }
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = subject.trim().length >= 5 && description.trim().length >= 10 && !busy;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm">
            <Plus className="size-4" /> Raise an issue
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LifeBuoy className="size-4 text-primary" />
            Raise a support issue
          </DialogTitle>
          <DialogDescription>
            Report a bug, onboarding blocker, or feature request directly to the development team.
            You’ll be notified as soon as we reply or resolve it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="grid grid-cols-1 gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="issue-category">Category</Label>
              <select
                id="issue-category"
                value={category}
                onChange={(e) => setCategory(e.target.value as IssueCategory)}
                className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm transition-[border-color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25"
              >
                {ISSUE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {ISSUE_CATEGORY_LABELS[c]}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="issue-priority">Priority / severity</Label>
              <select
                id="issue-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as IssuePriority)}
                className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm transition-[border-color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25"
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
            <Label htmlFor="issue-subject">Subject</Label>
            <Input
              id="issue-subject"
              required
              minLength={5}
              maxLength={200}
              placeholder="e.g. Unable to upload GMP certificate on verification checklist"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="issue-description">What happened / how can we help?</Label>
            <Textarea
              id="issue-description"
              required
              rows={4}
              minLength={10}
              maxLength={4000}
              placeholder="Describe the steps you took, any error message shown, or what your team needs…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="issue-page" className="text-xs text-muted-foreground">
              Page / route (auto-captured for the development team)
            </Label>
            <Input
              id="issue-page"
              maxLength={500}
              placeholder="/dashboard"
              value={pageUrl}
              onChange={(e) => setPageUrl(e.target.value)}
              className="h-8 font-mono text-xs text-muted-foreground"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!canSubmit}>
              {busy ? "Submitting…" : "Submit ticket"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
