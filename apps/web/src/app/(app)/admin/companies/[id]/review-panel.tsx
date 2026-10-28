"use client";

import {
  COMPANY_ROLE_LABELS,
  type CompanyRole,
  SUBSCRIPTION_TIERS,
  type SubscriptionTier,
  type VerificationStatus,
} from "@pharmachain/core";
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
import { Input } from "@pharmachain/ui/components/input";
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
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AnonymizeExplainer } from "@/components/anonymize-explainer";
import { UserStatusBadge } from "@/components/status-badge";
import { api } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/http";
import type { AnonymizeResult, MemberRow } from "@/lib/api/types";

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
            aria-label="Reason for rejection"
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

type OverrideAction =
  | { kind: "reset-password" }
  | { kind: "deactivate" }
  | { kind: "reactivate" }
  | { kind: "role"; role: CompanyRole }
  | { kind: "anonymize" };

/**
 * Super-admin user overrides (US-203) + GDPR anonymize (US-1003).
 *
 * Day-to-day roles (Operations, Finance) belong to the company's own admins, so
 * they are not offered here. The one role action a platform admin keeps is
 * appointing a Company Admin when the company has none — otherwise it would be
 * locked out of its own account for good.
 */
export function MemberOverrides({ members }: { members: MemberRow[] }) {
  const hasActiveAdmin = members.some(
    (m) => m.role === "COMPANY_ADMIN" && m.user.status === "ACTIVE",
  );
  const router = useRouter();
  const [pending, setPending] = useState<{ member: MemberRow; action: OverrideAction } | null>(
    null,
  );
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  // Each action says what it actually does. "Force password reset" read as the
  // platform admin resetting the password behind the user's back, when all it
  // does is email them a link — their password keeps working until they use it
  // (client review, 2026-10-27).
  function describe(action: OverrideAction, name: string): { title: string; body: string } {
    switch (action.kind) {
      case "reset-password":
        return {
          title: "Send password reset link",
          body: `${name} gets an email with a link to choose a new password, valid for one hour. Their current password keeps working until they use it; if they ignore the email, nothing changes.`,
        };
      case "deactivate":
        return {
          title: "Deactivate account",
          body: `${name} is signed out at once and cannot sign in until the account is reactivated. Nothing is erased. They are told by email.`,
        };
      case "reactivate":
        return {
          title: "Reactivate account",
          body: `${name} can sign in again. They are told by email.`,
        };
      case "role":
        return {
          title: `Appoint as ${COMPANY_ROLE_LABELS[action.role]}`,
          body: `This company has no active Company Admin. ${name} becomes one and can then manage its members and their roles. They are told by email.`,
        };
      case "anonymize":
        return {
          title: "Anonymize (GDPR erasure)",
          body: `Permanently erase ${name}'s personal data and close the account:`,
        };
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
        toast.success(`${member.user.name} is now Company Admin`);
      } else if (action.kind === "reset-password") {
        const { emailSent } = await api.post<{ emailSent: boolean }>(`${base}/reset-password`, {
          reason,
        });
        // The link only ever reaches the user by email, so a relay failure has
        // to be said out loud — "applied" would be untrue.
        if (emailSent) toast.success(`Reset link sent to ${member.user.email}`);
        else
          toast.error(
            "The reset email could not be sent, so nothing changed. Ask them to use “Forgot password” on the sign-in page.",
          );
      } else if (action.kind === "anonymize") {
        const result = await api.post<AnonymizeResult>(`${base}/anonymize`, { reason });
        toast.success(
          result.company?.leftWithoutAdmin
            ? "Anonymized. The company now has no Company Admin — appoint one of its members below."
            : "Anonymized — the request is recorded in the audit log",
        );
      } else {
        await api.post(`${base}/${action.kind}`, { reason });
        toast.success(action.kind === "deactivate" ? "Account deactivated" : "Account reactivated");
      }
      setPending(null);
      setReason("");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const copy = pending ? describe(pending.action, pending.member.user.name) : null;
  const otherActiveAdmins = pending
    ? members.filter(
        (m) =>
          m.user.id !== pending.member.user.id &&
          m.role === "COMPANY_ADMIN" &&
          m.user.status === "ACTIVE",
      ).length
    : 0;
  const soleAdmin =
    pending?.action.kind === "anonymize" &&
    pending.member.role === "COMPANY_ADMIN" &&
    pending.member.user.status === "ACTIVE" &&
    otherActiveAdmins === 0;

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
                <UserStatusBadge status={member.user.status} />
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
                      Send password reset link
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
                    {!hasActiveAdmin && member.role !== "COMPANY_ADMIN" && (
                      <DropdownMenuItem
                        onClick={() =>
                          setPending({ member, action: { kind: "role", role: "COMPANY_ADMIN" } })
                        }
                      >
                        Appoint as Company Admin
                      </DropdownMenuItem>
                    )}
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
            <DialogTitle>{copy?.title}</DialogTitle>
            <DialogDescription>{copy?.body}</DialogDescription>
          </DialogHeader>
          {pending?.action.kind === "anonymize" && (
            <AnonymizeExplainer
              name={pending.member.user.name}
              soleAdmin={
                soleAdmin
                  ? {
                      otherMembers: members.filter(
                        (m) => m.user.id !== pending.member.user.id && m.user.status === "ACTIVE",
                      ).length,
                    }
                  : undefined
              }
            />
          )}
          <p className="text-xs text-muted-foreground">
            A reason (min 5 characters) is required and recorded in the audit log.
          </p>
          <Textarea
            rows={3}
            aria-label="Reason for override"
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
              {busy
                ? "Applying…"
                : pending?.action.kind === "reset-password"
                  ? "Send link"
                  : pending?.action.kind === "anonymize"
                    ? "Anonymize permanently"
                    : (copy?.title ?? "Apply")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type LifecycleAction = "suspend" | "reactivate" | "delete";

interface Obligations {
  openOrders: number;
  openDisputes: number;
  pendingPayments: number;
  openInvoices: number;
  activeAppointments: number;
}

const LIFECYCLE_COPY: Record<LifecycleAction, { title: string; body: string; button: string }> = {
  suspend: {
    title: "Deactivate company",
    body: "Every member is signed out at once and cannot sign back in, and nothing the company published stays visible. Nothing is erased — you can reactivate it.",
    button: "Deactivate company",
  },
  reactivate: {
    title: "Reactivate company",
    body: "Members can sign in again. The company returns to Verified if it was verified before and its documents still pass; otherwise it goes back into the verification queue.",
    button: "Reactivate company",
  },
  delete: {
    title: "Delete company",
    body: "Permanent. Every member's personal data is erased, the primary contact is removed, API keys and invitations are revoked and listings withdrawn. Trading records (orders, documents, audit entries) are kept for the statutory retention period, so the company's registration number stays reserved.",
    button: "Delete company permanently",
  },
};

/**
 * Company-level access control. Deactivation is reversible; deletion is a
 * second, deliberate step available only once the company is deactivated, and
 * it is refused while orders, disputes or payments are still in flight.
 */
export function CompanyAccessControls({
  companyId,
  companyName,
  status,
}: {
  companyId: string;
  companyName: string;
  status: VerificationStatus;
}) {
  const router = useRouter();
  const [action, setAction] = useState<LifecycleAction | null>(null);
  const [reason, setReason] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const [obligations, setObligations] = useState<Obligations | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (action !== "delete") return;
    let cancelled = false;
    setObligations(null);
    api
      .get<Obligations>(`/admin/companies/${companyId}/obligations`)
      .then((o) => !cancelled && setObligations(o))
      .catch((err) => toast.error(errorMessage(err)));
    return () => {
      cancelled = true;
    };
  }, [action, companyId]);

  if (status === "DELETED") {
    return (
      <p className="text-sm text-muted-foreground">
        This company was deleted. Its personal data has been erased; its trading records are
        retained for the statutory period.
      </p>
    );
  }

  const blockers = obligations ? Object.values(obligations).reduce((a, b) => a + b, 0) : null;
  const nameMatches = confirmName.trim().toLowerCase() === companyName.trim().toLowerCase();
  const canSubmit =
    !busy && reason.trim().length >= 5 && (action !== "delete" || (nameMatches && blockers === 0));

  function close() {
    setAction(null);
    setReason("");
    setConfirmName("");
  }

  async function run() {
    if (!action) return;
    setBusy(true);
    try {
      await api.post(`/admin/companies/${companyId}/${action}`, {
        reason,
        ...(action === "delete" ? { confirmName } : {}),
      });
      toast.success(
        action === "delete"
          ? "Company deleted"
          : action === "suspend"
            ? "Company deactivated — members have been signed out"
            : "Company reactivated",
      );
      close();
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const copy = action ? LIFECYCLE_COPY[action] : null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {status === "SUSPENDED" ? (
          <>
            <Button variant="outline" onClick={() => setAction("reactivate")}>
              Reactivate company
            </Button>
            <Button variant="destructive" onClick={() => setAction("delete")}>
              Delete company…
            </Button>
          </>
        ) : (
          <Button variant="outline" onClick={() => setAction("suspend")}>
            Deactivate company
          </Button>
        )}
      </div>

      <Dialog open={action !== null} onOpenChange={(open) => !open && close()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{copy?.title}</DialogTitle>
            <DialogDescription>
              {copy?.body} A reason (min 5 characters) is required and is audited.
            </DialogDescription>
          </DialogHeader>
          {action === "delete" && (
            <div className="grid gap-3 text-sm">
              {obligations === null ? (
                <p className="text-muted-foreground">Checking for open obligations…</p>
              ) : blockers === 0 ? (
                <p className="text-success">Nothing in flight — this company can be deleted.</p>
              ) : (
                <p role="alert" className="text-destructive">
                  Cannot delete yet: {obligations.openOrders} order(s) not delivered,{" "}
                  {obligations.openDisputes} open dispute(s), {obligations.pendingPayments} pending
                  payment(s), {obligations.openInvoices} unsettled invoice(s),{" "}
                  {obligations.activeAppointments} active shipment appointment(s).
                </p>
              )}
              <div className="grid gap-1.5">
                <label htmlFor="confirm-company-name" className="text-muted-foreground">
                  Type <span className="font-medium text-foreground">{companyName}</span> to confirm
                </label>
                <Input
                  id="confirm-company-name"
                  autoComplete="off"
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                />
              </div>
            </div>
          )}
          <Textarea
            rows={3}
            placeholder="Reason…"
            aria-label="Reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              Cancel
            </Button>
            <Button
              variant={action === "delete" || action === "suspend" ? "destructive" : "default"}
              disabled={!canSubmit}
              onClick={run}
            >
              {busy ? "Applying…" : copy?.button}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
