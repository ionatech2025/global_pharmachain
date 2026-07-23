"use client";

import {
  ANNOUNCEMENT_AUDIENCES,
  type AnnouncementAudience,
  COMPANY_ROLE_LABELS,
  COMPANY_ROLES,
  type CompanyRole,
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
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@pharmachain/ui/components/dialog";
import { Input } from "@pharmachain/ui/components/input";
import { Label } from "@pharmachain/ui/components/label";
import { Textarea } from "@pharmachain/ui/components/textarea";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { api } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/http";
import type { AdminAnnouncementRow } from "@/lib/api/types";
import { fmtDate } from "@/lib/format";

export function AnnouncementManager({
  announcements,
  companies,
}: {
  announcements: AdminAnnouncementRow[];
  companies: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<AnnouncementAudience>("ALL");
  const [targetRole, setTargetRole] = useState<CompanyRole>("COMPANY_ADMIN");
  const [targetCompanyId, setTargetCompanyId] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  // US-902: announcements are editable until they expire or are retracted.
  const [editing, setEditing] = useState<AdminAnnouncementRow | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editExpiresAt, setEditExpiresAt] = useState("");

  function openEdit(a: AdminAnnouncementRow) {
    setEditing(a);
    setEditTitle(a.title);
    setEditBody(a.body);
    setEditExpiresAt(a.expiresAt ? a.expiresAt.slice(0, 10) : "");
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    try {
      await api.patch(`/admin/announcements/${editing.id}`, {
        title: editTitle,
        body: editBody,
        audience: editing.audience,
        targetRole: editing.audience === "ROLE" ? editing.targetRole : undefined,
        targetCompanyId: editing.audience === "COMPANY" ? editing.targetCompanyId : undefined,
        expiresAt: editExpiresAt ? new Date(`${editExpiresAt}T23:59:59Z`).toISOString() : undefined,
      });
      toast.success("Announcement updated");
      setEditing(null);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function publish(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/admin/announcements", {
        title,
        body,
        audience,
        targetRole: audience === "ROLE" ? targetRole : undefined,
        targetCompanyId: audience === "COMPANY" ? targetCompanyId : undefined,
        expiresAt: expiresAt ? new Date(`${expiresAt}T23:59:59Z`).toISOString() : undefined,
      });
      toast.success("Announcement published");
      setTitle("");
      setBody("");
      setExpiresAt("");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function retract(id: string) {
    try {
      await api.post(`/admin/announcements/${id}/retract`);
      toast.success("Announcement retracted");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">New announcement</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={publish} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                required
                minLength={3}
                maxLength={140}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="body">Body</Label>
              <Textarea
                id="body"
                rows={3}
                required
                minLength={5}
                maxLength={5000}
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div className="grid gap-2">
                <Label htmlFor="audience">Audience</Label>
                <select
                  id="audience"
                  className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm transition-[border-color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50"
                  value={audience}
                  onChange={(e) => setAudience(e.target.value as AnnouncementAudience)}
                >
                  {ANNOUNCEMENT_AUDIENCES.map((a) => (
                    <option key={a} value={a}>
                      {a === "ALL" ? "All users" : a === "ROLE" ? "By role" : "One company"}
                    </option>
                  ))}
                </select>
              </div>
              {audience === "ROLE" && (
                <div className="grid gap-2">
                  <Label htmlFor="targetRole">Role</Label>
                  <select
                    id="targetRole"
                    className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm transition-[border-color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50"
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value as CompanyRole)}
                  >
                    {COMPANY_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {COMPANY_ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {audience === "COMPANY" && (
                <div className="grid gap-2">
                  <Label htmlFor="targetCompanyId">Company</Label>
                  <select
                    id="targetCompanyId"
                    className="w-64 h-10 rounded-lg border border-input bg-transparent px-3 text-sm transition-[border-color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50"
                    required
                    value={targetCompanyId}
                    onChange={(e) => setTargetCompanyId(e.target.value)}
                  >
                    <option value="" disabled>
                      Select a company…
                    </option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="grid gap-2">
                <Label htmlFor="expiresAt">Expires (optional)</Label>
                <Input
                  id="expiresAt"
                  type="date"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={busy}>
                {busy ? "Publishing…" : "Publish"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {announcements.map((a) => (
        <Card key={a.id}>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm">
                {a.title}{" "}
                {a.status === "RETRACTED" ? (
                  <Badge variant="outline" className="ml-1">
                    retracted
                  </Badge>
                ) : a.expiresAt && new Date(a.expiresAt) < new Date() ? (
                  <Badge variant="secondary" className="ml-1">
                    expired
                  </Badge>
                ) : (
                  <Badge variant="success" className="ml-1">
                    live
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {a.audience === "ALL"
                  ? "All users"
                  : a.audience === "ROLE"
                    ? `Role: ${a.targetRole}`
                    : `Company: ${a.targetCompany?.name ?? "?"}`}
                {" · "}
                {fmtDate(a.createdAt)} by {a.createdBy.name}
                {a.expiresAt ? ` · expires ${fmtDate(a.expiresAt)}` : ""}
              </CardDescription>
            </div>
            {a.status !== "RETRACTED" && (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => openEdit(a)}>
                  Edit
                </Button>
                <ConfirmDialog
                  trigger={
                    <Button size="sm" variant="outline">
                      Retract
                    </Button>
                  }
                  title="Retract this announcement?"
                  description="It disappears for all users immediately and cannot be re-published."
                  confirmLabel="Retract"
                  destructive
                  onConfirm={() => retract(a.id)}
                />
              </div>
            )}
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">{a.body}</CardContent>
        </Card>
      ))}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit announcement</DialogTitle>
          </DialogHeader>
          <form onSubmit={saveEdit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="editTitle">Title</Label>
              <Input
                id="editTitle"
                required
                minLength={3}
                maxLength={140}
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="editBody">Body</Label>
              <Textarea
                id="editBody"
                rows={4}
                required
                minLength={5}
                maxLength={5000}
                value={editBody}
                onChange={(e) => setEditBody(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="editExpiresAt">Expires (optional)</Label>
              <Input
                id="editExpiresAt"
                type="date"
                value={editExpiresAt}
                onChange={(e) => setEditExpiresAt(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
