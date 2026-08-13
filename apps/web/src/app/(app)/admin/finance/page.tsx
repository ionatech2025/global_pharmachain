import { Badge } from "@pharmachain/ui/components/badge";
import { Button } from "@pharmachain/ui/components/button";
import { AlertTriangle, CircleDollarSign, Download, Percent, ShoppingCart } from "lucide-react";
import { Panel, PanelBody, PanelHeader, Provenance } from "@/components/dashboard/panel";
import { StatGrid, StatTile } from "@/components/dashboard/stat-tile";
import { PageHeader } from "@/components/page-header";
import { apiServer } from "@/lib/api/server";
import type { PaymentRow } from "@/lib/api/types";
import { fmtDate, fmtMoney, fmtNumber } from "@/lib/format";

export const metadata = { title: "Platform finance" };

interface CurrencyTotal {
  currency: string;
  total: number;
  count: number;
}
interface PlatformReport {
  revenue: {
    creditFees: CurrencyTotal[];
    commissions: CurrencyTotal[];
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

/**
 * Revenue arrives split by currency and is never blended into one figure. The
 * largest currency leads; the rest are named underneath.
 */
function lead(rows: CurrencyTotal[]): { value: string; caption: string } {
  const sorted = [...rows].sort((a, b) => b.total - a.total);
  const top = sorted[0];
  if (!top) return { value: "—", caption: "none yet" };
  const rest = sorted.length > 1 ? ` · plus ${sorted.length - 1} other currency(ies)` : "";
  return {
    value: fmtMoney(top.total, top.currency),
    caption: `${fmtNumber(top.count)} transaction(s)${rest}`,
  };
}

/** Platform financial reports + payment reconciliation (Phase 3 §1/§4). */
export default async function AdminFinancePage() {
  const api = await apiServer();
  const [report, recon] = await Promise.all([
    api.get<PlatformReport>("/admin/finance/report"),
    api.get<Reconciliation>("/admin/finance/reconciliation"),
  ]);

  const credit = lead(report.revenue.creditFees);
  const commission = lead(report.revenue.commissions);

  return (
    <div className="space-y-5">
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

      <StatGrid>
        <StatTile
          label="Revenue — credit fees"
          value={credit.value}
          icon={CircleDollarSign}
          caption={`confirmed pay-per-use purchases · ${credit.caption}`}
        />
        <StatTile
          label="Revenue — commissions"
          value={commission.value}
          icon={Percent}
          caption={`parameterised % on confirmed payments · ${commission.caption}`}
        />
        <StatTile
          label="Orders"
          value={fmtNumber(report.volumes.orders)}
          icon={ShoppingCart}
          caption={`${fmtNumber(report.volumes.invoices)} invoice(s) raised against them`}
        />
        <StatTile
          label="Stuck payments"
          value={fmtNumber(recon.staleOver7Days.length)}
          icon={AlertTriangle}
          goodDirection="down"
          caption="pending for more than 7 days"
          tone={recon.staleOver7Days.length > 0 ? "warning" : "default"}
        />
      </StatGrid>

      <div className="grid gap-3 xl:grid-cols-3">
        <Panel>
          <PanelHeader
            title="Payment volumes"
            description="Every payment the platform has recorded, by state and currency."
          />
          <PanelBody>
            {report.volumes.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
            ) : (
              <ul className="divide-y">
                {report.volumes.payments.map((p) => (
                  <li
                    key={`${p.currency}-${p.status}`}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Badge
                        variant={
                          p.status === "CONFIRMED"
                            ? "success"
                            : p.status === "FAILED"
                              ? "destructive"
                              : "warning"
                        }
                      >
                        {p.status.toLowerCase()}
                      </Badge>
                      <span className="num-col text-xs text-muted-foreground">
                        {fmtNumber(p.count)} payment(s)
                      </span>
                    </span>
                    <span className="num-col shrink-0 text-sm font-semibold">
                      {fmtMoney(p.total, p.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <Provenance>
              The platform never holds funds — these are records of payments made directly between
              trading companies.
            </Provenance>
          </PanelBody>
        </Panel>

        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Reconciliation"
            description="Platform records against gateway settlements. Webhook-settled payments carry the provider payload; payments pending beyond a week need chasing."
          />
          <PanelBody className="space-y-5">
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-xs font-medium tracking-wide uppercase">
                <AlertTriangle
                  className={`size-3.5 ${recon.staleOver7Days.length > 0 ? "text-warning" : "text-muted-foreground"}`}
                  aria-hidden="true"
                />
                <span
                  className={
                    recon.staleOver7Days.length > 0 ? "text-warning" : "text-muted-foreground"
                  }
                >
                  Pending over 7 days ({fmtNumber(recon.staleOver7Days.length)})
                </span>
              </h3>
              {recon.staleOver7Days.length === 0 ? (
                <p className="text-sm text-muted-foreground">None — nothing stuck.</p>
              ) : (
                <ul className="divide-y">
                  {recon.staleOver7Days.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0 truncate text-sm">
                        {p.providerRef}
                        <span className="text-muted-foreground">
                          {" "}
                          · {p.order?.orderNo} · {fmtDate(p.createdAt)}
                        </span>
                      </span>
                      <span className="num-col shrink-0 text-sm font-medium">
                        {fmtMoney(p.amount, p.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <h3 className="mb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Recently confirmed ({fmtNumber(recon.confirmed.length)})
              </h3>
              {recon.confirmed.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing confirmed yet.</p>
              ) : (
                <ul className="divide-y">
                  {recon.confirmed.slice(0, 10).map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0 truncate text-sm">
                        {p.providerRef}
                        <span className="text-muted-foreground"> · {p.order?.orderNo}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <Badge variant={p.settledBy === "webhook" ? "info" : "outline"}>
                          {p.settledBy}
                        </Badge>
                        <span className="num-col text-sm font-medium">
                          {fmtMoney(p.amount, p.currency)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
