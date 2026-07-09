import { Badge } from "@pharmachain/ui/components/badge";
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
import { apiServer } from "@/lib/api/server";
import type { RfqInboxRow } from "@/lib/api/types";
import { fmtDate, fmtNumber } from "@/lib/format";

export const metadata = { title: "Quote inbox" };

export default async function QuotesPage() {
  const api = await apiServer();
  const inbox = await api.get<RfqInboxRow[]>("/rfqs/inbox");

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
      )}
    </div>
  );
}
