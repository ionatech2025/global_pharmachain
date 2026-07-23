"use client";

import { Button } from "@pharmachain/ui/components/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@pharmachain/ui/components/table";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EmptyState } from "@/components/empty-state";
import { api } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/http";
import type { AdminCreditRequestRow } from "@/lib/api/types";
import { fmtDate, fmtMoney } from "@/lib/format";

export function CreditQueue({ requests }: { requests: AdminCreditRequestRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function decide(id: string, decision: "CONFIRM" | "REJECT", note?: string) {
    setBusyId(id);
    try {
      await api.post(`/admin/credit-requests/${id}/decide`, { decision, note });
      toast.success(decision === "CONFIRM" ? "Credits confirmed" : "Request rejected");
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  if (requests.length === 0) {
    return <EmptyState title="No pending requests" hint="New requests appear here oldest-first." />;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Requested</TableHead>
          <TableHead>Company</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Credits</TableHead>
          <TableHead>Fee</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {requests.map((request) => (
          <TableRow key={request.id}>
            <TableCell>{fmtDate(request.createdAt)}</TableCell>
            <TableCell>
              <Link
                href={`/admin/companies/${request.company.id}`}
                className="font-medium text-primary hover:underline"
              >
                {request.company.name}
              </Link>
              <p className="text-xs text-muted-foreground">
                by {request.requestedBy.name} ({request.requestedBy.email})
              </p>
            </TableCell>
            <TableCell>{request.kind}</TableCell>
            <TableCell>{request.count}</TableCell>
            <TableCell className="font-medium">{fmtMoney(request.fee, request.currency)}</TableCell>
            <TableCell className="space-x-1 text-right">
              <Button
                size="sm"
                disabled={busyId === request.id}
                onClick={() => decide(request.id, "CONFIRM")}
              >
                Confirm payment
              </Button>
              <ConfirmDialog
                trigger={
                  <Button size="sm" variant="outline" disabled={busyId === request.id}>
                    Reject
                  </Button>
                }
                title="Reject this credit request?"
                description="The company is notified with your reason and keeps its current limit."
                confirmLabel="Reject request"
                destructive
                reasonLabel="Reason shown to the company"
                onConfirm={(reason) => decide(request.id, "REJECT", reason)}
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
