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
import { api } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/http";
import type { InviteRow, MemberRow } from "@/lib/api/types";
import { fmtDate, fmtDateTime } from "@/lib/format";

const USER_STATUS_VARIANT = {
  ACTIVE: "success",
  INVITED: "warning",
  DEACTIVATED: "outline",
} as const;

/** Invite by email with a role; links are valid for 72 hours (US-201). */
export function InvitePanel({ invites }: { invites: InviteRow[] }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<CompanyRole>("OPERATIONS");
  const [busy, setBusy] = useState(false);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/companies/me/invites", { email, role });
      toast.success(`Invitation sent to ${email} (valid 72 hours)`);
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
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
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
    if (
      deactivating &&
      !window.confirm(`Deactivate ${member.user.name}? They are signed out immediately.`)
    ) {
      return;
    }
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
              <Badge variant={USER_STATUS_VARIANT[member.user.status]}>
                {member.user.status.toLowerCase()}
              </Badge>
            </TableCell>
            <TableCell className="text-muted-foreground">
              {member.user.lastLoginAt ? fmtDateTime(member.user.lastLoginAt) : "Never"}
            </TableCell>
            {canManage && (
              <TableCell className="text-right">
                {member.user.id !== meUserId && member.user.status !== "INVITED" && (
                  <Button size="sm" variant="ghost" onClick={() => toggleActive(member)}>
                    {member.user.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
                  </Button>
                )}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
