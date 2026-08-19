import { Badge } from "@pharmachain/ui/components/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@pharmachain/ui/components/table";
import { cn } from "@pharmachain/ui/lib/utils";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PaginationNav } from "@/components/pagination-nav";
import { QuotationStatusBadge } from "@/components/status-badge";
import { apiServer } from "@/lib/api/server";
import type { MyQuotationRow, Paginated, RfqInboxRow } from "@/lib/api/types";
import { fmtDate, fmtMoney, fmtNumber } from "@/lib/format";

export const metadata = { title: "Quote inbox" };

/**
 * Two questions, one workspace. The inbox answers "what can I quote on?"; the
 * sent view answers "what did I quote, and where did it land?". QA hit the gap:
 * the dashboard's "Active quotations" tile counts quotations *sent*, but the
 * only destination was the inbox, which lists RFQs — so the number never
 * matched the page. The tile now points at the sent view.
 */
type View = "inbox" | "sent";

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; view?: string }>;
}) {
  const params = await searchParams;
  const view: View = params.view === "sent" ? "sent" : "inbox";
  const page = Math.max(1, Number(params.page) || 1);
  const api = await apiServer();

  return (
    <div className="space-y-4">
      <PageHeader
        title="Quote inbox"
        description={
          view === "inbox"
            ? "Open RFQs targeted at your company category. RFQs disappear at their deadline."
            : "Quotations your company has sent, newest first."
        }
      />

      <ViewTabs current={view} />

      {view === "inbox" ? <InboxView api={api} page={page} /> : <SentView api={api} page={page} />}
    </div>
  );
}

function ViewTabs({ current }: { current: View }) {
  const tabs: Array<{ view: View; label: string; href: string }> = [
    { view: "inbox", label: "RFQs to quote on", href: "/quotes" },
    { view: "sent", label: "Quotations sent", href: "/quotes?view=sent" },
  ];
  return (
    <div className="flex gap-1 border-b" role="tablist" aria-label="Quote views">
      {tabs.map((tab) => (
        <Link
          key={tab.view}
          href={tab.href}
          role="tab"
          aria-selected={current === tab.view}
          className={cn(
            "touch-target -mb-px border-b-2 px-3 py-2 text-sm transition-colors",
            current === tab.view
              ? "border-primary font-medium text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

async function InboxView({
  api,
  page,
}: {
  api: Awaited<ReturnType<typeof apiServer>>;
  page: number;
}) {
  const result = await api.get<Paginated<RfqInboxRow>>("/rfqs/inbox", { query: { page } });
  if (result.items.length === 0) {
    return (
      <EmptyState
        title="No open RFQs right now"
        hint="RFQs matching your company category and published listing categories appear here."
      />
    );
  }
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>RFQ</TableHead>
            <TableHead>Buyer</TableHead>
            <TableHead>Quantity</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Deadline</TableHead>
            <TableHead>Your quote</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.items.map((rfq) => (
            <TableRow key={rfq.id}>
              <TableCell>
                <Link href={`/rfqs/${rfq.id}`} className="font-medium text-primary hover:underline">
                  {rfq.refNo}
                </Link>
                <p className="text-xs text-muted-foreground">{rfq.title}</p>
              </TableCell>
              <TableCell>
                {rfq.buyerCompany.name}
                <p className="text-xs text-muted-foreground">{rfq.buyerCompany.country}</p>
              </TableCell>
              <TableCell>
                {fmtNumber(rfq.quantity)} {rfq.unit}
              </TableCell>
              <TableCell className="text-muted-foreground">{rfq.category?.name ?? "Any"}</TableCell>
              <TableCell>{fmtDate(rfq.deadline)}</TableCell>
              <TableCell>
                {rfq.quotations.length > 0 ? (
                  <Badge variant="success">Submitted (v{rfq.quotations[0]?.version})</Badge>
                ) : (
                  <Badge variant="outline">Not quoted</Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <PaginationNav
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        noun="open RFQ(s)"
        basePath="/quotes"
      />
    </>
  );
}

async function SentView({
  api,
  page,
}: {
  api: Awaited<ReturnType<typeof apiServer>>;
  page: number;
}) {
  const result = await api.get<Paginated<MyQuotationRow>>("/quotations/mine", { query: { page } });
  if (result.items.length === 0) {
    return (
      <EmptyState
        title="No quotations sent yet"
        hint="Open an RFQ from the inbox and submit an offer — it will be listed here with its status."
      />
    );
  }
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>RFQ</TableHead>
            <TableHead>Buyer</TableHead>
            <TableHead>Unit price</TableHead>
            <TableHead>Total</TableHead>
            <TableHead>Lead time</TableHead>
            <TableHead>Valid until</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.items.map((q) => (
            <TableRow key={q.id}>
              <TableCell>
                <Link
                  href={`/rfqs/${q.rfq.id}`}
                  className="font-medium text-primary hover:underline"
                >
                  {q.rfq.refNo}
                </Link>
                <p className="text-xs text-muted-foreground">{q.rfq.title}</p>
              </TableCell>
              <TableCell>
                {q.rfq.buyerCompany.name}
                <p className="text-xs text-muted-foreground">{q.rfq.buyerCompany.country}</p>
              </TableCell>
              <TableCell className="tabular-nums">{fmtMoney(q.unitPrice, q.currency)}</TableCell>
              <TableCell className="font-medium tabular-nums">
                {fmtMoney(q.totalPrice, q.currency)}
              </TableCell>
              <TableCell>{q.leadTimeDays} days</TableCell>
              <TableCell>{fmtDate(q.validUntil)}</TableCell>
              <TableCell>
                <QuotationStatusBadge status={q.status} />
                {q.version > 1 && (
                  <Badge variant="outline" className="ml-1.5">
                    v{q.version}
                  </Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <PaginationNav
        page={result.page}
        totalPages={result.totalPages}
        total={result.total}
        noun="quotation(s)"
        basePath="/quotes"
        params={{ view: "sent" }}
      />
    </>
  );
}
