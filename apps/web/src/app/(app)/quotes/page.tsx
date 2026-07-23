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
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PaginationNav } from "@/components/pagination-nav";
import { apiServer } from "@/lib/api/server";
import type { Paginated, RfqInboxRow } from "@/lib/api/types";
import { fmtDate, fmtNumber } from "@/lib/format";

export const metadata = { title: "Quote inbox" };

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const api = await apiServer();
  const result = await api.get<Paginated<RfqInboxRow>>("/rfqs/inbox", { query: { page } });
  const inbox = result.items;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Quote inbox"
        description="Open RFQs targeted at your company category (US-402). RFQs disappear at their deadline."
      />

      {inbox.length === 0 ? (
        <EmptyState
          title="No open RFQs right now"
          hint="RFQs matching your company category and published listing categories appear here."
        />
      ) : (
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
              {inbox.map((rfq) => (
                <TableRow key={rfq.id}>
                  <TableCell>
                    <Link
                      href={`/rfqs/${rfq.id}`}
                      className="font-medium text-primary hover:underline"
                    >
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
                  <TableCell className="text-muted-foreground">
                    {rfq.category?.name ?? "Any"}
                  </TableCell>
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
      )}
    </div>
  );
}
