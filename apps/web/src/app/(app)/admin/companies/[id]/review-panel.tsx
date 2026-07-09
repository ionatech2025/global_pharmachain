"use client";

import {
  COMPANY_ROLE_LABELS,
  COMPANY_ROLES,
  type CompanyRole,
  SUBSCRIPTION_TIERS,
  type SubscriptionTier,
} from "@pharmachain/core";
import { Badge } from "@pharmachain/ui/components/badge";
import { Button } from "@pharmachain/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@pharmachain/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@pharmachain/ui/components/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@pharmachain/ui/components/table";
import { Textarea } from "@pharmachain/ui/components/textarea";
import { MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/http";
import type { MemberRow } from "@/lib/api/types";

/** Approve / reject with mandatory rejection reason (US-104). */
export function VerificationDecision({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function decide(decision: "APPROVE" | "REJECT") {
    setBusy(true);
    try {
      await api.post(`/admin/companies/${companyId}/verify`, {
        decision,
        reason: decision === "REJECT" ? reason : undefined,
      });
      toast.success(
        decision === "APPROVE"
          ? "Company verified — they can now publish their profile"
          : "Company rejected — they see the reason and can re-upload",
      );
      setRejecting(false);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex gap-2 pt-1">
      <Button size="sm" onClick={() => decide("APPROVE")} disabled={busy}>
        Approve
      </Button>
      <Button size="sm" variant="destructive" onClick={() => setRejecting(true)} disabled={busy}>
        Reject…
      </Button>

      <Dialog open={rejecting} onOpenChange={setRejecting}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reject verification</DialogTitle>
            <DialogDescription>
              The reason is shown to the company and recorded in the audit log (min 5 characters).
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            placeholder="e.g. Trading licence is expired; please upload the current one."
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={busy || reason.trim().length < 5}
              onClick={() => decide("REJECT")}
            >
              Reject company
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Tier assignment (US-905): Premium/Featured get marketplace badges. */
export function TierSelect({ companyId, tier }: { companyId: string; tier: SubscriptionTier }) {
  const router = useRouter();

  async function change(next: SubscriptionTier) {
    if (next === tier) return;
    try {
      await api.patch(`/admin/companies/${companyId}/tier`, { tier: next });
      toast.success(`Tier set to ${next} — the company has been notified`);
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <select
      aria-label="Subscription tier"
      className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
      value={tier}
      onChange={(e) => change(e.target.value as SubscriptionTier)}
    >
      {SUBSCRIPTION_TIERS.map((t) => (
        <option key={t} value={t}>
          {t.toLowerCase()}
        </option>
      ))}
    </select>
  );
}

const USER_STATUS_VARIANT = {
  ACTIVE: "success",
  INVITED: "warning",
  DEACTIVATED: "outline",
} as const;

type OverrideAction =
  | { kind: "reset-password" }
  | { kind: "deactivate" }
  | { kind: "reactivate" }
  | { kind: "role"; role: CompanyRole }
  | { kind: "anonymize" };

/** Super-admin user overrides (US-203) + GDPR anonymize (US-1003). */
export function MemberOverrides({ members }: { members: MemberRow[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<{ member: MemberRow; action: OverrideAction } | null>(
    null,
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  function describe(action: OverrideAction): string {
    switch (action.kind) {
      case "reset-password":
        return "send a password-reset link and revoke all sessions";
      case "deactivate":
        return "deactivate the account (immediate sign-out)";
      case "reactivate":
        return "reactivate the account";
      case "role":
        return `reassign the role to ${COMPANY_ROLE_LABELS[action.role]}`;
      case "anonymize":
        return "permanently anonymize the account (GDPR deletion — irreversible)";
    }
  }

  async function run() {
    if (!pending) return;
    const { member, action } = pending;
    setBusy(true);
    try {
      const base = `/admin/users/${member.user.id}`;
      if (action.kind === "role") {
        await api.post(`${base}/role`, { role: action.role, reason });
      } else {
        await api.post(`${base}/${action.kind}`, { reason });
      }
      toast.success("Override applied and audited");
      setPending(null);
      setReason("");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Member</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => (
            <TableRow key={member.user.id}>
              <TableCell>
                <p className="font-medium">{member.user.name}</p>
                <p className="text-xs text-muted-foreground">{member.user.email}</p>
              </TableCell>
              <TableCell>{COMPANY_ROLE_LABELS[member.role]}</TableCell>
              <TableCell>
                <Badge variant={USER_STATUS_VARIANT[member.user.status]}>
                  {member.user.status.toLowerCase()}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="Member actions">
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => setPending({ member, action: { kind: "reset-password" } })}
                    >
                      Force password reset
                    </DropdownMenuItem>
                    {member.user.status === "ACTIVE" ? (
                      <DropdownMenuItem
                        onClick={() => setPending({ member, action: { kind: "deactivate" } })}
                      >
                        Deactivate
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        onClick={() => setPending({ member, action: { kind: "reactivate" } })}
                      >
                        Reactivate
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuSeparator />
                    {COMPANY_ROLES.filter((r) => r !== member.role).map((role) => (
                      <DropdownMenuItem
                        key={role}
                        onClick={() => setPending({ member, action: { kind: "role", role } })}
                      >
                        Make {COMPANY_ROLE_LABELS[role]}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => setPending({ member, action: { kind: "anonymize" } })}
                    >
                      Anonymize (GDPR)
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm override</DialogTitle>
            <DialogDescription>
              You are about to {pending ? describe(pending.action) : ""} for{" "}
              {pending?.member.user.name}. A reason (min 5 characters) is required; the action is
              audited and the user is notified by email.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            placeholder="Reason for this override…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              variant={pending?.action.kind === "anonymize" ? "destructive" : "default"}
              disabled={busy || reason.trim().length < 5}
              onClick={run}
            >
              {busy ? "Applying…" : "Apply override"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
