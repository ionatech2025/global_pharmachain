"use client";

import { Badge } from "@pharmachain/ui/components/badge";
import { Button } from "@pharmachain/ui/components/button";
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
import { EmptyState } from "@/components/empty-state";
import { api } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/http";
import type { DeletionRequestRow } from "@/lib/api/types";
import { fmtDate } from "@/lib/format";

const SLA_DAYS = 30;

function daysLeft(createdAt: string): number {
  return SLA_DAYS - Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000);
}

export function DeletionQueue({ requests }: { requests: DeletionRequestRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function anonymize(request: DeletionRequestRow, reason?: string) {
    if (!reason || reason.trim().length < 5) return;
    setBusyId(request.id);
    try {
      await api.post(`/admin/users/${request.user.id}/anonymize`, { reason });
      toast.success("User anonymized — the request is marked completed");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  if (requests.length === 0) {
    return <EmptyState title="No pending requests" hint="Deletion requests appear here." />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Requested</TableHead>
          <TableHead>User</TableHead>
          <TableHead>SLA</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {requests.map((request) => {
          const remaining = daysLeft(request.createdAt);
          return (
            <TableRow key={request.id}>
              <TableCell>{fmtDate(request.createdAt)}</TableCell>
              <TableCell>
                <p className="font-medium">{request.user.name}</p>
                <p className="text-xs text-muted-foreground">{request.user.email}</p>
              </TableCell>
              <TableCell>
                {remaining < 0 ? (
                  <Badge variant="destructive">overdue by {-remaining}d</Badge>
                ) : remaining <= 7 ? (
                  <Badge variant="warning">{remaining}d left</Badge>
                ) : (
                  <span className="text-sm text-muted-foreground">{remaining}d left</span>
                )}
              </TableCell>
              <TableCell className="text-right">
                <ConfirmDialog
                  trigger={
                    <Button size="sm" variant="destructive" disabled={busyId === request.id}>
                      Anonymize
                    </Button>
                  }
                  title={`Anonymize ${request.user.email}?`}
                  description="Irreversible: personal data is tombstoned, sessions revoked, the account deactivated. Audit and financial records are retained as required."
                  confirmLabel="Anonymize"
                  destructive
                  reasonLabel="Reason (recorded in the audit log)"
                  onConfirm={(reason) => anonymize(request, reason)}
                />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
