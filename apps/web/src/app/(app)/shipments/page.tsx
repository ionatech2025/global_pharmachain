import { LOGISTICS_ROLE_LABELS } from "@pharmachain/core";
import { Badge } from "@pharmachain/ui/components/badge";
import { Card, CardContent } from "@pharmachain/ui/components/card";
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
import { OrderStatusBadge } from "@/components/status-badge";
import { apiServer } from "@/lib/api/server";
import type { AppointedShipmentRow } from "@/lib/api/types";
import { fmtDate } from "@/lib/format";

export const metadata = { title: "Shipments" };

/** Appointed-shipments workspace for forwarders, clearing agents and
 *  transporters (Phase 2 §2): exactly the shipments they are appointed to. */
export default async function ShipmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const api = await apiServer();
  const data = await api.get<{
    items: AppointedShipmentRow[];
    total: number;
    page: number;
    pageSize: number;
  }>(`/shipments?page=${page}`);
  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Logistics"
        title="Appointed shipments"
        description="Shipments your company is appointed on — update stages, documents and tracking."
      />
      {data.items.length === 0 ? (
        <EmptyState
          title="No appointments yet"
          hint="When a buyer appoints your company on a shipment, it appears here and your team is notified."
        />
      ) : (
        <Card>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Lane</TableHead>
                  <TableHead>Your role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>ETA</TableHead>
                  <TableHead>Appointed</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Link
                        href={`/orders/${row.order.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {row.order.orderNo}
                      </Link>
                      <p className="max-w-52 truncate text-xs text-muted-foreground">
                        {row.order.title}
                      </p>
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.order.sellerCompany.name}
                      <span className="text-muted-foreground"> → </span>
                      {row.order.buyerCompany.name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{LOGISTICS_ROLE_LABELS[row.role]}</Badge>
                    </TableCell>
                    <TableCell>
                      <OrderStatusBadge status={row.order.status} />
                    </TableCell>
                    <TableCell className="text-sm">
                      {row.order.eta ? fmtDate(row.order.eta) : "—"}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {fmtDate(row.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
      <PaginationNav
        page={page}
        totalPages={totalPages}
        total={data.total}
        noun="shipment"
        basePath="/shipments"
        params={{}}
      />
    </div>
  );
}
