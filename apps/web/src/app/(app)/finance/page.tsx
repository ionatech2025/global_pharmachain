import type { AuthenticatedUser } from "@pharmachain/auth";
import { INVOICE_STATUS_LABELS, LEDGER_ENTRY_LABELS } from "@pharmachain/core";
import { Badge } from "@pharmachain/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@pharmachain/ui/components/table";
import { ArrowDownLeft, ArrowUpRight, Receipt, ScrollText } from "lucide-react";
import Link from "next/link";
import { Panel, PanelBody, PanelHeader } from "@/components/dashboard/panel";
import { StatGrid, StatTile } from "@/components/dashboard/stat-tile";
import { DocumentChip } from "@/components/document-chip";
import { PageHeader } from "@/components/page-header";
import { apiServer } from "@/lib/api/server";
import type { InvoiceRow, LedgerRow, PaymentRow } from "@/lib/api/types";
import { fmtDate, fmtMoney, fmtNumber } from "@/lib/format";
import { CurrencyPreference, ExportButtons, ScheduleToggle } from "./finance-controls";

export const metadata = { title: "Finance" };

const DAY = 24 * 60 * 60 * 1000;
/** The API caps each payment list at this many rows, newest first. */
const ROW_CAP = 500;

function invoiceBadgeVariant(status: InvoiceRow["status"]) {
  return status === "PAID"
    ? ("success" as const)
    : status === "ISSUED"
      ? ("warning" as const)
      : status === "VOID"
        ? ("secondary" as const)
        : ("outline" as const);
}

/**
 * Money never sums across currencies. Totals are kept per currency and the
 * largest is shown as the headline, with the rest named in the caption —
 * a single blended number would be a lie about what the company holds.
 */
function byCurrency(rows: Array<{ amount: string; currency: string }>): Array<[string, number]> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const value = Number.parseFloat(row.amount);
    if (Number.isFinite(value)) totals.set(row.currency, (totals.get(row.currency) ?? 0) + value);
  }
  return [...totals.entries()].sort((a, b) => b[1] - a[1]);
}

function headline(rows: Array<{ amount: string; currency: string }>): {
  value: string;
  extra: string;
} {
  const totals = byCurrency(rows);
  const top = totals[0];
  return {
    value: top ? fmtMoney(top[1], top[0]) : "—",
    extra: totals.length > 1 ? ` · plus ${totals.length - 1} other currency(ies)` : "",
  };
}

const within = (rows: PaymentRow[], from: number, to = Number.POSITIVE_INFINITY) =>
  rows.filter((p) => {
    const at = new Date(p.createdAt).getTime();
    return at >= from && at < to;
  });

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

  const now = Date.now();
  const currentFrom = now - 30 * DAY;
  const previousFrom = now - 60 * DAY;
  const inNow = within(report.paymentsIn, currentFrom);
  const inPrev = within(report.paymentsIn, previousFrom, currentFrom);
  const outNow = within(report.paymentsOut, currentFrom);
  const outPrev = within(report.paymentsOut, previousFrom, currentFrom);
  // A truncated list would make a period-over-period comparison wrong, so the
  // delta is simply withheld rather than shown as an approximation.
  const inComplete = report.paymentsIn.length < ROW_CAP;
  const outComplete = report.paymentsOut.length < ROW_CAP;

  const received = headline(inNow);
  const paid = headline(outNow);
  const outstanding = headline(
    report.outstanding.map((i) => ({ amount: i.total, currency: i.currency })),
  );
  const issued = invoices.filter((i) => i.issuer?.id === companyId).length;

  const movements = [
    ...report.paymentsIn.map((p) => ({ ...p, direction: "in" as const })),
    ...report.paymentsOut.map((p) => ({ ...p, direction: "out" as const })),
  ]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 12);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Workspace"
        title="Finance"
        description="Payments, invoices and your account ledger — the platform never holds funds."
      >
        <CurrencyPreference current={me.preferredCurrency ?? null} />
      </PageHeader>

      <StatGrid>
        <StatTile
          label="Received"
          value={received.value}
          icon={ArrowDownLeft}
          delta={inComplete ? { current: inNow.length, previous: inPrev.length } : undefined}
          caption={`${fmtNumber(inNow.length)} payment(s) in 30 days${received.extra}`}
        />
        <StatTile
          label="Paid out"
          value={paid.value}
          icon={ArrowUpRight}
          goodDirection="neutral"
          delta={outComplete ? { current: outNow.length, previous: outPrev.length } : undefined}
          caption={`${fmtNumber(outNow.length)} payment(s) in 30 days${paid.extra}`}
        />
        <StatTile
          label="Outstanding"
          value={outstanding.value}
          icon={Receipt}
          caption={`${fmtNumber(report.outstanding.length)} issued invoice(s) unpaid${outstanding.extra}`}
          tone={report.outstanding.length > 0 ? "warning" : "default"}
        />
        <StatTile
          label="Invoices"
          value={fmtNumber(invoices.length)}
          icon={ScrollText}
          caption={`${fmtNumber(issued)} issued · ${fmtNumber(invoices.length - issued)} received`}
        />
      </StatGrid>

      <div className="grid gap-3 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Cash movement"
            description="Incoming and outgoing payments, newest first. Receipts are confirmed from the order page."
          />
          <PanelBody>
            {movements.length === 0 ? (
              <p className="text-sm text-muted-foreground">No payments yet.</p>
            ) : (
              <ul className="divide-y">
                {movements.map((p) => (
                  <li
                    key={`${p.direction}-${p.id}`}
                    className="flex items-center justify-between gap-3 py-2.5"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span
                        className={`tile-chip ${
                          p.direction === "in"
                            ? "bg-success/12 text-success"
                            : "bg-muted text-muted-foreground"
                        }`}
                        aria-hidden="true"
                      >
                        {p.direction === "in" ? (
                          <ArrowDownLeft className="size-3.5" />
                        ) : (
                          <ArrowUpRight className="size-3.5" />
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {p.order?.orderNo ?? p.providerRef}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {fmtDate(p.createdAt)} · {p.status.toLowerCase()}
                        </span>
                      </span>
                    </span>
                    <span
                      className={`num-col shrink-0 text-sm font-semibold ${
                        p.direction === "in" ? "text-success" : ""
                      }`}
                    >
                      {p.direction === "in" ? "+" : "−"}
                      {fmtMoney(p.amount, p.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Outstanding invoices" description="Issued but not yet fully paid." />
          <PanelBody>
            {report.outstanding.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing outstanding.</p>
            ) : (
              <ul className="divide-y">
                {report.outstanding.map((inv) => (
                  <li key={inv.id} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{inv.invoiceNo}</span>
                      {inv.order && (
                        <Link
                          href={`/orders/${inv.order.id}`}
                          className="text-xs text-primary hover:underline"
                        >
                          {inv.order.orderNo}
                        </Link>
                      )}
                    </span>
                    <span className="num-col shrink-0 text-sm font-semibold">
                      {fmtMoney(inv.total, inv.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </PanelBody>
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title="Invoices"
          description="Issued and received. Duty and VAT come from the platform tax rules, with the FX rate stamped at issue."
        />
        <PanelBody className="px-0">
          {invoices.length === 0 ? (
            <p className="px-5 text-sm text-muted-foreground">No invoices yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Invoice</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead>Counterparty</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="pr-5">PDF</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((inv) => {
                  const isIssued = inv.issuer?.id === companyId;
                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="pl-5 font-medium">{inv.invoiceNo}</TableCell>
                      <TableCell>
                        <Badge variant={isIssued ? "outline" : "secondary"}>
                          {isIssued ? "Issued" : "Received"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {(isIssued ? inv.recipient?.name : inv.issuer?.name) ?? "—"}
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
                      <TableCell className="text-right">
                        <span className="font-medium">{fmtMoney(inv.total, inv.currency)}</span>
                        <span className="block text-xs font-normal text-muted-foreground">
                          duty {fmtMoney(inv.dutyAmount, inv.currency)} · VAT{" "}
                          {fmtMoney(inv.vatAmount, inv.currency)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={invoiceBadgeVariant(inv.status)}>
                          {INVOICE_STATUS_LABELS[inv.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="pr-5">
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
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          title="Account ledger"
          description="Append-only record of every financial event on your company."
          action={<ExportButtons />}
        />
        <PanelBody className="px-0">
          {ledger.length === 0 ? (
            <p className="px-5 text-sm text-muted-foreground">No entries yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Date</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead className="pr-5 text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ledger.slice(0, 30).map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="pl-5 text-sm text-muted-foreground">
                      {fmtDate(e.createdAt)}
                    </TableCell>
                    <TableCell className="text-sm">{LEDGER_ENTRY_LABELS[e.kind]}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{e.note ?? "—"}</TableCell>
                    <TableCell
                      className={`pr-5 text-right font-medium ${
                        Number(e.amount) >= 0 ? "text-success" : ""
                      }`}
                    >
                      {Number(e.amount) >= 0 ? "+" : ""}
                      {fmtMoney(e.amount, e.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {ledger.length > 30 && (
            <p className="px-5 pt-3 text-[11px] text-muted-foreground">
              Showing the 30 most recent of {fmtNumber(ledger.length)} entries — export for the full
              record.
            </p>
          )}
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          title="Scheduled report delivery"
          description="A summary of your ledger activity by email, weekly or monthly."
        />
        <PanelBody>
          <ScheduleToggle initial={schedule} />
        </PanelBody>
      </Panel>
    </div>
  );
}
