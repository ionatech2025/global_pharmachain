"use client";

import { COMPANY_ROLE_LABELS, COMPANY_ROLES, type CompanyRole } from "@pharmachain/core";
import { Badge } from "@pharmachain/ui/components/badge";
import { Button } from "@pharmachain/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pharmachain/ui/components/card";
import { Input } from "@pharmachain/ui/components/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@pharmachain/ui/components/table";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { UserStatusBadge } from "@/components/status-badge";
import { api } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/http";
import type { CreatedInvite, InviteRow, MemberRow } from "@/lib/api/types";
import { fmtDate, fmtDateTime } from "@/lib/format";

/** Invite by email with a role; links are valid for 72 hours (US-201). */
export function InvitePanel({ invites }: { invites: InviteRow[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<CompanyRole>("OPERATIONS");
  const [busy, setBusy] = useState(false);
  // Set only when the relay refused the invitation, so the admin can still
  // get their colleague in. Persistent on the page rather than a toast: the
  // link is the whole point of the message and has to survive being read.
  const [undelivered, setUndelivered] = useState<{ email: string; url: string } | null>(null);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const created = await api.post<CreatedInvite>("/companies/me/invites", { email, role });
      if (created.emailSent) {
        setUndelivered(null);
        toast.success(`Invitation sent to ${email} (valid 72 hours)`);
      } else {
        setUndelivered({ email, url: created.inviteUrl ?? "" });
        toast.warning(`Couldn't email ${email} — send them the link below`);
      }
      setEmail("");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string, inviteEmail: string) {
    try {
      await api.post(`/companies/me/invites/${id}/revoke`);
      toast.success(`Invitation to ${inviteEmail} revoked`);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Invite a colleague</CardTitle>
        <CardDescription>
          One company per user — emails already registered elsewhere are rejected.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={invite} className="flex flex-wrap items-end gap-2">
          <div className="min-w-56 flex-1">
            <Input
              type="email"
              required
              placeholder="colleague@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <select
            aria-label="Role for the invited member"
            className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm transition-[border-color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50"
            value={role}
            onChange={(e) => setRole(e.target.value as CompanyRole)}
          >
            {COMPANY_ROLES.map((r) => (
              <option key={r} value={r}>
                {COMPANY_ROLE_LABELS[r]}
              </option>
            ))}
          </select>
          <Button type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send invite"}
          </Button>
        </form>

        {undelivered?.url && (
          <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
            <p className="font-medium">Invitation created, but the email didn't go out</p>
            <p className="mt-0.5 text-muted-foreground">
              {undelivered.email} was invited and the link below works for 72 hours — send it to
              them directly. Ask your platform admin to check the mail settings.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1.5 font-mono text-xs">
                {undelivered.url}
              </code>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(undelivered.url);
                  toast.success("Invitation link copied");
                }}
              >
                Copy link
              </Button>
            </div>
          </div>
        )}

        {invites.length > 0 && (
          <ul className="space-y-1 text-sm">
            {invites.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-2">
                <span>
                  {inv.email}{" "}
                  <span className="text-muted-foreground">
                    · {COMPANY_ROLE_LABELS[inv.role]} · expires {fmtDate(inv.expiresAt)}
                  </span>
                </span>
                <Button size="sm" variant="ghost" onClick={() => revoke(inv.id, inv.email)}>
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Role changes and deactivation apply immediately — deactivation revokes
 *  the member's active sessions (US-202). */
export function MembersTable({
  members,
  meUserId,
  canManage,
}: {
  members: MemberRow[];
  meUserId: string;
  canManage: boolean;
}) {
  const router = useRouter();

  // US-202: the API refuses to leave a company without an active Company Admin,
  // but that last admin can only ever be the viewer — and their own row used to
  // render no control at all, so the rule was invisible. Say why instead.
  const activeAdmins = members.filter(
    (m) => m.role === "COMPANY_ADMIN" && m.user.status === "ACTIVE",
  ).length;
  const ownRowReason =
    activeAdmins === 1
      ? "You're the only active Company Admin"
      : "You can't deactivate your own account";

  async function changeRole(userId: string, role: CompanyRole) {
    try {
      await api.patch(`/companies/me/members/${userId}/role`, { role });
      toast.success("Role updated");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  async function toggleActive(member: MemberRow) {
    const deactivating = member.user.status === "ACTIVE";
    try {
      await api.post(
        `/companies/me/members/${member.user.id}/${deactivating ? "deactivate" : "reactivate"}`,
      );
      toast.success(deactivating ? "Member deactivated" : "Member reactivated");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Member</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Last login</TableHead>
          {canManage && <TableHead />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map((member) => (
          <TableRow key={member.user.id}>
            <TableCell>
              <p className="font-medium">
                {member.user.name}
                {member.user.id === meUserId && (
                  <span className="ml-1 text-xs text-muted-foreground">(you)</span>
                )}
              </p>
              <p className="text-xs text-muted-foreground">{member.user.email}</p>
            </TableCell>
            <TableCell>
              {canManage && member.user.id !== meUserId ? (
                <select
                  aria-label={`Role for ${member.user.name}`}
                  className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
                  value={member.role}
                  onChange={(e) => changeRole(member.user.id, e.target.value as CompanyRole)}
                >
                  {COMPANY_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {COMPANY_ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              ) : (
                COMPANY_ROLE_LABELS[member.role]
              )}
            </TableCell>
            <TableCell>
              <UserStatusBadge status={member.user.status} />
            </TableCell>
            <TableCell className="text-muted-foreground">
              {member.user.lastLoginAt ? fmtDateTime(member.user.lastLoginAt) : "Never"}
            </TableCell>
            {canManage && (
              <TableCell className="text-right">
                {member.user.id === meUserId ? (
                  <div className="flex flex-col items-end gap-0.5">
                    <Button size="sm" variant="ghost" disabled>
                      Deactivate
                    </Button>
                    <span className="text-xs text-balance text-muted-foreground">
                      {ownRowReason}
                    </span>
                  </div>
                ) : (
                  member.user.status !== "INVITED" &&
                  (member.user.status === "ACTIVE" ? (
                    <ConfirmDialog
                      trigger={
                        <Button size="sm" variant="ghost">
                          Deactivate
                        </Button>
                      }
                      title={`Deactivate ${member.user.name}?`}
                      description="They are signed out immediately and can no longer log in. Their history stays attributed to them."
                      confirmLabel="Deactivate"
                      destructive
                      onConfirm={() => toggleActive(member)}
                    />
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => toggleActive(member)}>
                      Reactivate
                    </Button>
                  ))
                )}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
