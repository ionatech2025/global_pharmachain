import { ORDER_STATUSES, type OrderStatus } from "@pharmachain/core";
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
import { Suspense } from "react";
import { EmptyState } from "@/components/empty-state";
import { LiveSearch } from "@/components/live-search";
import { PageHeader } from "@/components/page-header";
import { PaginationNav } from "@/components/pagination-nav";
import { OrderStatusBadge } from "@/components/status-badge";
import { apiServer } from "@/lib/api/server";
import type { AdminOrderRow, Paginated } from "@/lib/api/types";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";
import { StageFilter } from "./stage-filter";

export const metadata = { title: "Orders" };

// The follow-up views first; every exact stage stays reachable from the select.
const QUICK_FILTERS: ReadonlyArray<readonly [string, string]> = [
  ["", "All"],
  ["OPEN", "In progress"],
  ["LATE", "Past ETA"],
  ["DELIVERED", "Awaiting buyer confirmation"],
  ["COMPLETE", "Completed"],
];
const KNOWN_FILTERS = new Set<string>([...QUICK_FILTERS.map(([v]) => v), ...ORDER_STATUSES]);

/**
 * Platform order oversight (US-701 TC4; client review 2026-11-12: "the system
 * admin sees the number of orders but cannot open them or follow them up").
 * Each order opens its normal page, where a super admin gets "Correct status":
 * any stage, a mandatory reason, recorded in the audit log, every party told.
 */
export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const params = await searchParams;
  // An unknown filter (a stale bookmark) shows everything rather than a 400.
  const status = params.status && KNOWN_FILTERS.has(params.status) ? params.status : undefined;
  const api = await apiServer();
  const orders = await api.get<Paginated<AdminOrderRow>>("/admin/orders", {
    query: { q: params.q, status, page: params.page ?? 1 },
  });
  const now = Date.now();

  const hrefFor = (value: string) => {
    const search = new URLSearchParams();
    if (value) search.set("status", value);
    if (params.q) search.set("q", params.q);
    const qs = search.toString();
    return qs ? `/admin/orders?${qs}` : "/admin/orders";
  };
  const stageFilter = status && (ORDER_STATUSES as readonly string[]).includes(status);

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Platform admin"
        title="Orders"
        description="Every order on the platform. Open one to follow it up or correct a stage set in error — corrections need a reason, land in the audit log and notify every party."
      >
        <LiveSearch
          label="Search orders"
          placeholder="Order no., item, RFQ or company…"
          className="w-72"
        />
      </PageHeader>

      <div className="flex flex-wrap items-center gap-1 text-sm">
        {QUICK_FILTERS.map(([value, label]) => {
          const active = (status ?? "") === value;
          return (
            <Link
              key={label}
              href={hrefFor(value)}
              aria-current={active ? "page" : undefined}
              className={`touch-target rounded-md px-3 py-1.5 transition-colors ${
                active
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-accent"
              }`}
            >
              {label}
            </Link>
          );
        })}
        <div className="ml-auto">
          <Suspense fallback={null}>
            <StageFilter value={stageFilter && status ? status : ""} />
          </Suspense>
        </div>
      </div>

      {orders.items.length === 0 ? (
        <EmptyState
          title="No orders found"
          hint={
            params.q || status
              ? "No order matches that search or filter — clear it to see every order."
              : "Orders are created when a buyer accepts a quotation on an RFQ."
          }
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
                <TableHead>Stage</TableHead>
                <TableHead>Last update</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.items.map((o) => {
                const late =
                  o.eta !== null &&
                  new Date(o.eta).getTime() < now &&
                  o.status !== "DELIVERED" &&
                  o.status !== "DELIVERY_CONFIRMED";
                return (
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
                    <TableCell className="whitespace-nowrap">
                      {fmtDate(o.eta)}
                      {late && (
                        <Badge variant="destructive" className="ml-1.5">
                          Past ETA
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <OrderStatusBadge status={o.status as OrderStatus} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {fmtDateTime(o.lastUpdateAt)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <PaginationNav
            page={orders.page}
            totalPages={orders.totalPages}
            total={orders.total}
            noun="order(s)"
            basePath="/admin/orders"
            params={{ q: params.q, status }}
          />
        </>
      )}
    </div>
  );
}
