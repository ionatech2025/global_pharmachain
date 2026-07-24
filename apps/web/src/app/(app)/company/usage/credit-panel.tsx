"use client";

import {
  CREDIT_KIND_LABELS,
  CREDIT_KINDS,
  type CreditKind,
  type SubscriptionTier,
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
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CreditStatusBadge } from "@/components/status-badge";
import { api } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/http";
import type { CreditRequestRow } from "@/lib/api/types";
import { fmtDate, fmtMoney } from "@/lib/format";

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
  // US-907: the configured fee is displayed at the point of request.
  const [fees, setFees] = useState<{
    rfq: string;
    quotation: string;
    featured: string;
    verificationPremium: string;
    insights: string;
    currency: string;
  } | null>(null);
  useEffect(() => {
    api
      .get<{
        rfq: string;
        quotation: string;
        featured: string;
        verificationPremium: string;
        insights: string;
        currency: string;
      }>("/billing/credit-fees")
      .then(setFees)
      .catch(() => setFees(null));
  }, []);
  // Phase 4 §3: featured placement + premium verification are flat purchases
  // through the same manual-payment flow; usage credits price per unit.
  const flat = kind !== "RFQ" && kind !== "QUOTATION";
  const FEE_KEY = {
    RFQ: "rfq",
    QUOTATION: "quotation",
    FEATURED: "featured",
    VERIFICATION_PREMIUM: "verificationPremium",
    DATA_INSIGHTS: "insights",
  } as const;
  const feePerCredit = fees ? fees[FEE_KEY[kind]] : null;
  const parsedCount = flat ? 1 : Number.parseInt(count, 10);
  const feeDue =
    feePerCredit !== null && Number.isFinite(parsedCount) && parsedCount > 0
      ? (Number.parseFloat(feePerCredit) * parsedCount).toFixed(2)
      : null;
  // Usage credits only make sense on Freemium; the flat purchases (featured,
  // premium verification, data insights) are open to every tier.
  const availableKinds = CREDIT_KINDS.filter(
    (k) => tier === "FREEMIUM" || (k !== "RFQ" && k !== "QUOTATION"),
  );

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
            ? "Buy additional monthly credits, 30 days of featured placement, or the premium verification package."
            : "Your plan is unmetered — featured placement and verification packages are still available."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {canRequest && (
          <form onSubmit={request} className="flex flex-wrap items-end gap-2">
            <select
              aria-label="Credit type"
              className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm transition-[border-color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50"
              value={kind}
              onChange={(e) => setKind(e.target.value as CreditKind)}
            >
              {availableKinds.map((k) => (
                <option key={k} value={k}>
                  {CREDIT_KIND_LABELS[k]}
                </option>
              ))}
            </select>
            {!flat && (
              <Input
                className="w-24"
                type="number"
                min={1}
                max={100}
                required
                value={count}
                onChange={(e) => setCount(e.target.value)}
              />
            )}
            <Button type="submit" disabled={busy}>
              {busy ? "Submitting…" : flat ? "Purchase" : "Request credits"}
            </Button>
            {fees && feeDue && (
              <p className="w-full text-xs text-muted-foreground">
                Fee due:{" "}
                <span className="font-medium text-foreground">
                  {fmtMoney(feeDue, fees.currency)}
                </span>{" "}
                {flat
                  ? "(one-off)"
                  : `(${fmtMoney(feePerCredit ?? "0", fees.currency)} per credit)`}{" "}
                — payable off-platform, confirmed by the platform team.
              </p>
            )}
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
                  <TableCell>{CREDIT_KIND_LABELS[c.kind as CreditKind] ?? c.kind}</TableCell>
                  <TableCell>{c.count}</TableCell>
                  <TableCell>{fmtMoney(c.fee, c.currency)}</TableCell>
                  <TableCell>
                    <CreditStatusBadge status={c.status} />
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
