import { Badge } from "@pharmachain/ui/components/badge";
import { Button } from "@pharmachain/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pharmachain/ui/components/card";
import { Download } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { apiServer } from "@/lib/api/server";
import type { PaymentRow } from "@/lib/api/types";
import { fmtDate, fmtMoney } from "@/lib/format";

export const metadata = { title: "Platform finance" };

interface PlatformReport {
  revenue: {
    creditFees: Array<{ currency: string; total: number; count: number }>;
    commissions: Array<{ currency: string; total: number; count: number }>;
  };
  volumes: {
    payments: Array<{ currency: string; status: string; total: number; count: number }>;
    orders: number;
    invoices: number;
  };
}

interface Reconciliation {
  staleOver7Days: PaymentRow[];
  confirmed: Array<PaymentRow & { settledBy: string }>;
  failed: PaymentRow[];
}

/** Platform financial reports + payment reconciliation (Phase 3 §1/§4). */
export default async function AdminFinancePage() {
  const api = await apiServer();
  const [report, recon] = await Promise.all([
    api.get<PlatformReport>("/admin/finance/report"),
    api.get<Reconciliation>("/admin/finance/reconciliation"),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Platform admin"
        title="Platform finance"
        description="Revenue by fee type, transaction volumes and gateway reconciliation."
      >
        <div className="flex gap-2">
          {(["csv", "xls", "pdf"] as const).map((format) => (
            <Button key={format} asChild size="sm" variant="outline">
              <a href={`/api/proxy/admin/finance/report?format=${format}`} download>
                <Download className="size-3.5" /> {format.toUpperCase()}
              </a>
            </Button>
          ))}
        </div>
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Revenue — credit fees</CardTitle>
            <CardDescription>Confirmed pay-per-use credit purchases.</CardDescription>
          </CardHeader>
          <CardContent>
            {report.revenue.creditFees.length === 0 ? (
              <p className="text-sm text-muted-foreground">None yet.</p>
            ) : (
              report.revenue.creditFees.map((r) => (
                <p key={r.currency} className="text-display text-3xl tabular-nums">
                  {fmtMoney(r.total, r.currency)}
                  <span className="ml-2 align-middle font-sans text-xs text-muted-foreground normal-case">
                    {r.count} purchase(s)
                  </span>
                </p>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Revenue — commissions</CardTitle>
            <CardDescription>Parameterised % on confirmed payments.</CardDescription>
          </CardHeader>
          <CardContent>
            {report.revenue.commissions.length === 0 ? (
              <p className="text-sm text-muted-foreground">None yet.</p>
            ) : (
              report.revenue.commissions.map((r) => (
                <p key={r.currency} className="text-display text-3xl tabular-nums">
                  {fmtMoney(r.total, r.currency)}
                  <span className="ml-2 align-middle font-sans text-xs text-muted-foreground normal-case">
                    {r.count} payment(s)
                  </span>
                </p>
              ))
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Volumes</CardTitle>
            <CardDescription>Across the whole platform.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>
              <span className="text-display mr-2 text-3xl tabular-nums">
                {report.volumes.orders}
              </span>
              orders · {report.volumes.invoices} invoices
            </p>
            {report.volumes.payments.map((p) => (
              <p key={`${p.currency}-${p.status}`} className="text-muted-foreground">
                {p.status.toLowerCase()}: {fmtMoney(p.total, p.currency)} ({p.count})
              </p>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Reconciliation</CardTitle>
          <CardDescription>
            Platform records vs gateway settlements — webhook-settled payments carry the provider
            payload; stale pending payments need chasing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="mb-1.5 text-xs font-medium tracking-wide text-warning uppercase">
              Pending &gt; 7 days ({recon.staleOver7Days.length})
            </h3>
            {recon.staleOver7Days.length === 0 ? (
              <p className="text-sm text-muted-foreground">None — nothing stuck.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {recon.staleOver7Days.map((p) => (
                  <li key={p.id} className="flex justify-between gap-2">
                    <span>
                      {p.providerRef} · {p.order?.orderNo} · {fmtDate(p.createdAt)}
                    </span>
                    <span className="tabular-nums">{fmtMoney(p.amount, p.currency)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Recently confirmed ({recon.confirmed.length})
            </h3>
            <ul className="space-y-1 text-sm">
              {recon.confirmed.slice(0, 10).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2">
                  <span className="truncate">
                    {p.providerRef} · {p.order?.orderNo}
                  </span>
                  <span className="flex items-center gap-2">
                    <Badge variant={p.settledBy === "webhook" ? "info" : "outline"}>
                      {p.settledBy}
                    </Badge>
                    <span className="tabular-nums">{fmtMoney(p.amount, p.currency)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
