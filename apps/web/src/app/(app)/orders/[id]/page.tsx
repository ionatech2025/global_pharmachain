import type { AuthenticatedUser } from "@pharmachain/auth";
import {
  DOCUMENT_KIND_LABELS,
  ORDER_DOCUMENT_KINDS,
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  orderStatusIndex,
} from "@pharmachain/core";
import { Badge } from "@pharmachain/ui/components/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pharmachain/ui/components/card";
import { cn } from "@pharmachain/ui/lib/utils";
import { Check } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentChip } from "@/components/document-chip";
import { PageHeader } from "@/components/page-header";
import { OrderStatusBadge } from "@/components/status-badge";
import { UploadButton } from "@/components/upload-button";
import { ApiClientError } from "@/lib/api/http";
import { apiServer } from "@/lib/api/server";
import type { DocumentRow, OrderDetail } from "@/lib/api/types";
import { fmtDate, fmtDateTime, fmtMoney, fmtNumber } from "@/lib/format";
import { EtaButton, MessageCounterpartyButton, StatusUpdateButton } from "./panels";

export const metadata = { title: "Order" };

/** Six-stage visual progress tracker with the current stage highlighted (US-702). */
function ShipmentTracker({ status }: { status: OrderDetail["status"] }) {
  const current = orderStatusIndex(status);
  return (
    <ol className="flex flex-wrap items-start gap-y-4">
      {ORDER_STATUSES.map((stage, i) => (
        <li key={stage} className="flex min-w-24 flex-1 flex-col items-center gap-1.5">
          <div className="flex w-full items-center">
            <div
              className={cn(
                "h-0.5 flex-1",
                i === 0 ? "bg-transparent" : i <= current ? "bg-primary" : "bg-border",
              )}
            />
            <div
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold",
                i < current && "border-primary bg-primary text-primary-foreground",
                i === current && "border-primary text-primary ring-4 ring-primary/15",
                i > current && "border-border text-muted-foreground",
              )}
            >
              {i < current ? <Check className="size-4" /> : i + 1}
            </div>
            <div
              className={cn(
                "h-0.5 flex-1",
                i === ORDER_STATUSES.length - 1
                  ? "bg-transparent"
                  : i < current
                    ? "bg-primary"
                    : "bg-border",
              )}
            />
          </div>
          <span
            className={cn(
              "px-1 text-center text-xs",
              i === current ? "font-semibold text-primary" : "text-muted-foreground",
            )}
          >
            {ORDER_STATUS_LABELS[stage]}
          </span>
        </li>
      ))}
    </ol>
  );
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const api = await apiServer();

  let order: OrderDetail;
  try {
    order = await api.get<OrderDetail>(`/orders/${id}`);
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 404) notFound();
    throw err;
  }
  const [documents, me] = await Promise.all([
    api.get<DocumentRow[]>(`/orders/${id}/documents`),
    api.get<AuthenticatedUser>("/auth/me"),
  ]);
  const canUpdateShipment = order.viewerIsSeller || me.isSuperAdmin;
  const counterparty = order.viewerIsSeller ? order.buyerCompany : order.sellerCompany;
  const lastEvent = order.statusEvents[0];
  const documentsByKind = ORDER_DOCUMENT_KINDS.map((kind) => ({
    kind,
    docs: documents.filter((d) => d.kind === kind),
  })).filter((g) => g.docs.length > 0);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader
        title={`Order ${order.orderNo}`}
        description={`${order.title} · from RFQ ${order.rfq.refNo}`}
      >
        <div className="flex items-center gap-2">
          <OrderStatusBadge status={order.status} />
          {(order.viewerIsBuyer || order.viewerIsSeller) && (
            <MessageCounterpartyButton orderId={order.id} counterpartyName={counterparty.name} />
          )}
        </div>
      </PageHeader>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm">Shipment progress</CardTitle>
            <CardDescription>
              ETA {fmtDate(order.eta)}
              {lastEvent ? ` · last updated ${fmtDateTime(lastEvent.createdAt)}` : ""}
            </CardDescription>
          </div>
          {canUpdateShipment && (
            <div className="flex gap-2">
              <EtaButton order={order} />
              <StatusUpdateButton order={order} isSuperAdmin={me.isSuperAdmin} />
            </div>
          )}
        </CardHeader>
        <CardContent>
          <ShipmentTracker status={order.status} />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Order summary</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Quantity</dt>
              <dd>
                {fmtNumber(order.quantity)} {order.unit}
              </dd>
              <dt className="text-muted-foreground">Unit price</dt>
              <dd>{fmtMoney(order.unitPrice, order.currency)}</dd>
              <dt className="text-muted-foreground">Total</dt>
              <dd className="font-medium">{fmtMoney(order.totalAmount, order.currency)}</dd>
              <dt className="text-muted-foreground">Lead time</dt>
              <dd>{order.quotation.leadTimeDays} days</dd>
              <dt className="text-muted-foreground">Buyer</dt>
              <dd>
                <Link href={`/companies/${order.buyerCompany.id}`} className="hover:underline">
                  {order.buyerCompany.name}
                </Link>
              </dd>
              <dt className="text-muted-foreground">Supplier</dt>
              <dd>
                <Link href={`/companies/${order.sellerCompany.id}`} className="hover:underline">
                  {order.sellerCompany.name}
                </Link>
              </dd>
              <dt className="text-muted-foreground">Source RFQ</dt>
              <dd>
                <Link href={`/rfqs/${order.rfq.id}`} className="text-primary hover:underline">
                  {order.rfq.refNo}
                </Link>
              </dd>
              <dt className="text-muted-foreground">Quotation</dt>
              <dd>{order.quotation.refNo}</dd>
              {(order.forwarderName || order.forwarderEmail) && (
                <>
                  <dt className="text-muted-foreground">Forwarder</dt>
                  <dd>
                    {order.forwarderName ?? "—"}
                    {order.forwarderEmail ? ` (${order.forwarderEmail})` : ""}
                  </dd>
                </>
              )}
              <dt className="text-muted-foreground">Confirmed</dt>
              <dd>{fmtDate(order.createdAt)}</dd>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Status history</CardTitle>
            <CardDescription>Every change is timestamped with its note (US-702).</CardDescription>
          </CardHeader>
          <CardContent>
            {order.statusEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No updates yet.</p>
            ) : (
              <ol className="space-y-3">
                {order.statusEvents.map((event) => (
                  <li key={event.id} className="border-l-2 border-border pl-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <OrderStatusBadge status={event.status} />
                      <span className="text-xs text-muted-foreground">
                        {fmtDateTime(event.createdAt)} · {event.actor.name}
                      </span>
                    </div>
                    {event.note && <p className="mt-1 text-muted-foreground">{event.note}</p>}
                    {event.eta && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        ETA set to {fmtDate(event.eta)}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm">Order documents</CardTitle>
            <CardDescription>
              Grouped by type, newest first; superseded versions are retained (US-501/502).
            </CardDescription>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {ORDER_DOCUMENT_KINDS.filter((k) => k !== "OTHER").map((kind) => (
              <UploadButton
                key={kind}
                kind={kind}
                label={DOCUMENT_KIND_LABELS[kind]}
                links={{ orderId: order.id }}
              />
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {documentsByKind.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No documents yet — upload proforma invoices, COAs, quality certificates or shipping
              instructions above.
            </p>
          ) : (
            <div className="space-y-4">
              {documentsByKind.map(({ kind, docs }) => (
                <div key={kind}>
                  <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {DOCUMENT_KIND_LABELS[kind]}
                  </h3>
                  <ul className="space-y-1">
                    {docs.map((doc) => (
                      <li key={doc.id} className="flex flex-wrap items-center gap-2">
                        <DocumentChip id={doc.id} fileName={doc.fileName} />
                        {doc.version > 1 && <Badge variant="outline">v{doc.version}</Badge>}
                        {doc.status === "SUPERSEDED" && (
                          <Badge variant="secondary">superseded</Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {fmtDate(doc.createdAt)} · {doc.uploadedBy.name}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
