import type { AuthenticatedUser } from "@pharmachain/auth";
import { INVOICE_STATUS_LABELS, LEDGER_ENTRY_LABELS } from "@pharmachain/core";
import { Badge } from "@pharmachain/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pharmachain/ui/components/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@pharmachain/ui/components/table";
import Link from "next/link";
import { DocumentChip } from "@/components/document-chip";
import { PageHeader } from "@/components/page-header";
import { apiServer } from "@/lib/api/server";
import type { InvoiceRow, LedgerRow, PaymentRow } from "@/lib/api/types";
import { fmtDate, fmtMoney } from "@/lib/format";
import { CurrencyPreference, ExportButtons, ScheduleToggle } from "./finance-controls";

export const metadata = { title: "Finance" };

function invoiceBadgeVariant(status: InvoiceRow["status"]) {
  return status === "PAID"
    ? ("success" as const)
    : status === "ISSUED"
      ? ("warning" as const)
      : status === "VOID"
        ? ("secondary" as const)
        : ("outline" as const);
}

/** Company finance workspace (Phase 3): payments, invoices, ledger, reports. */
export default async function FinancePage() {
  const api = await apiServer();
  const [report, invoices, ledger, schedules, me] = await Promise.all([
    api.get<{
      paymentsOut: PaymentRow[];
      paymentsIn: PaymentRow[];
      outstanding: InvoiceRow[];
    }>("/finance/report"),
    api.get<InvoiceRow[]>("/invoices"),
    api.get<LedgerRow[]>("/finance/ledger"),
    api.get<Array<{ report: string; frequency: string; active: boolean }>>("/finance/schedule"),
    api.get<AuthenticatedUser & { preferredCurrency?: string | null }>("/auth/me"),
  ]);
  const schedule = schedules.find((s) => s.report === "company-finance") ?? null;
  const companyId = me.membership?.companyId;

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Workspace"
        title="Finance"
        description="Payments, invoices and your account ledger — the platform never holds funds."
      >
        <CurrencyPreference current={me.preferredCurrency ?? null} />
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Payments</CardTitle>
            <CardDescription>
              Incoming and outgoing, newest first. Confirm receipts from the order page.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {report.paymentsIn.length + report.paymentsOut.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {[
                  ...report.paymentsIn.map((p) => ({ ...p, direction: "in" as const })),
                  ...report.paymentsOut.map((p) => ({ ...p, direction: "out" as const })),
                ]
                  .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                  .slice(0, 12)
                  .map((p) => (
                    <li
                      key={`${p.direction}-${p.id}`}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="truncate text-muted-foreground">
                        {fmtDate(p.createdAt)} · {p.order?.orderNo ?? p.providerRef} ·{" "}
                        {p.status.toLowerCase()}
                      </span>
                      <span
                        className={`font-medium tabular-nums ${p.direction === "in" ? "text-success" : ""}`}
                      >
                        {p.direction === "in" ? "+" : "−"}
                        {fmtMoney(p.amount, p.currency)}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Outstanding invoices</CardTitle>
            <CardDescription>Issued but not yet fully paid.</CardDescription>
          </CardHeader>
          <CardContent>
            {report.outstanding.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing outstanding.</p>
            ) : (
              <ul className="space-y-1.5">
                {report.outstanding.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">
                      {inv.invoiceNo}
                      {inv.order && (
                        <Link
                          href={`/orders/${inv.order.id}`}
                          className="ml-2 text-xs text-primary hover:underline"
                        >
                          {inv.order.orderNo}
                        </Link>
                      )}
                    </span>
                    <span className="font-medium tabular-nums">
                      {fmtMoney(inv.total, inv.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Invoices</CardTitle>
          <CardDescription>
            Issued and received; duty/VAT applied from the platform tax rules, FX rate stamped at
            issue.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {invoices.length === 0 ? (
            <p className="px-6 text-sm text-muted-foreground">No invoices yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Counterparty</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>PDF</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => {
                  const issued = inv.issuer?.id === companyId;
                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="font-medium">{inv.invoiceNo}</TableCell>
                      <TableCell>
                        <Badge variant={issued ? "outline" : "secondary"}>
                          {issued ? "Issued" : "Received"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {(issued ? inv.recipient?.name : inv.issuer?.name) ?? "—"}
                      </TableCell>
                      <TableCell>
                        {inv.order && (
                          <Link
                            href={`/orders/${inv.order.id}`}
                            className="text-sm text-primary hover:underline"
                          >
                            {inv.order.orderNo}
                          </Link>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtMoney(inv.total, inv.currency)}
                        <p className="text-xs font-normal text-muted-foreground">
                          duty {fmtMoney(inv.dutyAmount, inv.currency)} · VAT{" "}
                          {fmtMoney(inv.vatAmount, inv.currency)}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Badge variant={invoiceBadgeVariant(inv.status)}>
                          {INVOICE_STATUS_LABELS[inv.status]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {inv.documentId ? (
                          <DocumentChip id={inv.documentId} fileName={`${inv.invoiceNo}.pdf`} />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm">Account ledger</CardTitle>
            <CardDescription>
              Append-only record of every financial event on your company.
            </CardDescription>
          </div>
          <ExportButtons />
        </CardHeader>
        <CardContent className="px-0">
          {ledger.length === 0 ? (
            <p className="px-6 text-sm text-muted-foreground">No entries yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledger.slice(0, 30).map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="text-sm text-muted-foreground">
                      {fmtDate(e.createdAt)}
                    </TableCell>
                    <TableCell className="text-sm">{LEDGER_ENTRY_LABELS[e.kind]}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.note ?? "—"}</TableCell>
                    <TableCell
                      className={`text-right tabular-nums ${Number(e.amount) >= 0 ? "text-success" : ""}`}
                    >
                      {Number(e.amount) >= 0 ? "+" : ""}
                      {fmtMoney(e.amount, e.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Scheduled report delivery</CardTitle>
          <CardDescription>
            A summary of your ledger activity by email, weekly or monthly.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScheduleToggle initial={schedule} />
        </CardContent>
      </Card>
    </div>
  );
}
