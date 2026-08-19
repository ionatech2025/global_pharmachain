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
import type { OrderRow, Paginated } from "@/lib/api/types";
import { fmtDate, fmtMoney } from "@/lib/format";

export const metadata = { title: "Orders" };

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; page?: string }>;
}) {
  const params = await searchParams;
  const api = await apiServer();
  const orders = await api.get<Paginated<OrderRow>>("/orders", {
    query: { role: params.role, page: params.page ?? 1 },
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Orders" description="Confirmed orders with live shipment status.">
        <div className="flex gap-1 text-sm">
          {[
            ["", "All"],
            ["buyer", "Buying"],
            ["seller", "Supplying"],
          ].map(([role, label]) => (
            <Link
              key={label}
              href={role ? `/orders?role=${role}` : "/orders"}
              className={`rounded-md px-3 py-1.5 ${
                (params.role ?? "") === role
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-accent"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      </PageHeader>

      {orders.items.length === 0 ? (
        <EmptyState
          title="No orders yet"
          hint="Orders are created when a buyer accepts a quotation on an RFQ."
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Item</TableHead>
                <TableHead>Buyer</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>ETA</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.items.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <Link
                      href={`/orders/${o.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {o.orderNo}
                    </Link>
                    <p className="text-xs text-muted-foreground">from {o.rfq.refNo}</p>
                  </TableCell>
                  <TableCell className="max-w-56 truncate" title={o.title}>
                    {o.title}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{o.buyerCompany.name}</TableCell>
                  <TableCell className="text-muted-foreground">{o.sellerCompany.name}</TableCell>
                  <TableCell className="font-medium tabular-nums whitespace-nowrap">
                    {fmtMoney(o.totalAmount, o.currency)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{fmtDate(o.eta)}</TableCell>
                  <TableCell>
                    <OrderStatusBadge status={o.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationNav
            page={orders.page}
            totalPages={orders.totalPages}
            total={orders.total}
            noun="order(s)"
            basePath="/orders"
            params={{ role: params.role }}
          />
        </>
      )}
    </div>
  );
}
