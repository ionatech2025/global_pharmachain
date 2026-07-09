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
import { RfqStatusBadge } from "@/components/status-badge";
import { apiServer } from "@/lib/api/server";
import type { RfqRow } from "@/lib/api/types";
import { fmtDate, fmtNumber } from "@/lib/format";

export const metadata = { title: "My RFQs" };

export default async function RfqsPage() {
  const api = await apiServer();
  const rfqs = await api.get<RfqRow[]>("/rfqs");

  return (
    <div className="space-y-4">
      <PageHeader title="My RFQs" description="Requests for quotation your company has raised.">
        <Button asChild>
          <Link href="/rfqs/new">Raise RFQ</Link>
        </Button>
      </PageHeader>

      {rfqs.length === 0 ? (
        <EmptyState
          title="No RFQs yet"
          hint="Raise an RFQ to receive quotations from verified suppliers in your target category."
        >
          <Button asChild variant="outline">
            <Link href="/rfqs/new">Raise your first RFQ</Link>
          </Button>
        </EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reference</TableHead>
              <TableHead>Item</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Deadline</TableHead>
              <TableHead>Quotes</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rfqs.map((rfq) => (
              <TableRow key={rfq.id}>
                <TableCell>
                  <Link
                    href={`/rfqs/${rfq.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {rfq.refNo}
                  </Link>
                </TableCell>
                <TableCell>{rfq.title}</TableCell>
                <TableCell>
                  {fmtNumber(rfq.quantity)} {rfq.unit}
                </TableCell>
                <TableCell>{fmtDate(rfq.deadline)}</TableCell>
                <TableCell>{rfq._count.quotations}</TableCell>
                <TableCell>
                  <RfqStatusBadge status={rfq.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
