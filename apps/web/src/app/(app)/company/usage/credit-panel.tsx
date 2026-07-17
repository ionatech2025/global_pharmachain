"use client";

import { CREDIT_KINDS, type CreditKind, type SubscriptionTier } from "@pharmachain/core";
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
import type { CreditRequestRow } from "@/lib/api/types";
import { fmtDate, fmtMoney } from "@/lib/format";

const CREDIT_STATUS_VARIANT = {
  PENDING_PAYMENT: "warning",
  CONFIRMED: "success",
  REJECTED: "destructive",
} as const;

/** Manual billing flow (US-907): request credits → pay off-platform → the
 *  platform team confirms receipt, raising this month's effective limit. */
export function CreditRequestPanel({
  credits,
  canRequest,
  tier,
}: {
  credits: CreditRequestRow[];
  canRequest: boolean;
  tier: SubscriptionTier;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<CreditKind>("RFQ");
  const [count, setCount] = useState("5");
  const [busy, setBusy] = useState(false);

  async function request(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const created = await api.post<CreditRequestRow>("/billing/credit-requests", {
        kind,
        count: Number(count),
      });
      toast.success(
        `Request submitted — fee ${fmtMoney(created.fee, "USD")}. The platform team confirms once payment is received.`,
      );
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Extra credits</CardTitle>
        <CardDescription>
          {tier === "FREEMIUM"
            ? "Buy additional RFQ or quotation credits for the current month, or contact the platform team to upgrade your plan."
            : "Your plan is unmetered — credits only apply to Freemium companies."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {canRequest && tier === "FREEMIUM" && (
          <form onSubmit={request} className="flex flex-wrap items-end gap-2">
            <select
              aria-label="Credit type"
              className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
              value={kind}
              onChange={(e) => setKind(e.target.value as CreditKind)}
            >
              {CREDIT_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k === "RFQ" ? "RFQ credits" : "Quotation credits"}
                </option>
              ))}
            </select>
            <Input
              className="w-24"
              type="number"
              min={1}
              max={100}
              required
              value={count}
              onChange={(e) => setCount(e.target.value)}
            />
            <Button type="submit" disabled={busy}>
              {busy ? "Submitting…" : "Request credits"}
            </Button>
          </form>
        )}

        {credits.length === 0 ? (
          <p className="text-sm text-muted-foreground">No credit requests yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Requested</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Credits</TableHead>
                <TableHead>Fee</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {credits.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>{fmtDate(c.createdAt)}</TableCell>
                  <TableCell>{c.kind === "RFQ" ? "RFQ" : "Quotation"}</TableCell>
                  <TableCell>{c.count}</TableCell>
                  <TableCell>{fmtMoney(c.fee, "USD")}</TableCell>
                  <TableCell>
                    <Badge variant={CREDIT_STATUS_VARIANT[c.status]}>
                      {c.status.toLowerCase().replace("_", " ")}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
