import type { AuthenticatedUser } from "@pharmachain/auth";
import {
  DOCUMENT_KIND_LABELS,
  type DocumentKind,
  FREIGHT_MODE_LABELS,
  LOGISTICS_ROLE_LABELS,
  ORDER_DOCUMENT_KINDS,
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  orderStatusIndex,
  SHIPMENT_EXCEPTION_LABELS,
  type ShipmentException,
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
import { Check, Snowflake } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentChip } from "@/components/document-chip";
import { PageHeader } from "@/components/page-header";
import { RateEngagementButton } from "@/components/ratings";
import { OrderStatusBadge } from "@/components/status-badge";
import { UploadButton } from "@/components/upload-button";
import { ApiClientError } from "@/lib/api/http";
import { apiServer } from "@/lib/api/server";
import type { DocumentRow, OrderDetail, OrderPayments } from "@/lib/api/types";
import { fmtDate, fmtDateTime, fmtMoney, fmtNumber } from "@/lib/format";
import {
  IssueInvoiceButton,
  PaymentActions,
  PaymentStatusBadge,
  RecordPaymentButton,
} from "./finance-panels";
import {
  AppointPartnerButton,
  DisputeButtons,
  DisputeList,
  ExceptionButton,
  FreightButton,
  LocationsCard,
  PodButton,
  RevokeAppointmentButton,
} from "./logistics-panels";
import { EtaButton, MessageCounterpartyButton, StatusUpdateButton } from "./panels";
import { TraceCard } from "./trace-card";

export const metadata = { title: "Order" };

/** Six-stage visual progress tracker with the current stage highlighted and
 *  the date each checkpoint was reached under its node (US-702). */
function ShipmentTracker({
  status,
  reachedAt,
}: {
  status: OrderDetail["status"];
  reachedAt: Partial<Record<OrderDetail["status"], string>>;
}) {
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
          {reachedAt[stage] && (
            <span className="text-[10px] text-muted-foreground">{fmtDate(reachedAt[stage])}</span>
          )}
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
  // Payments are a trade-party view (Phase 3); appointees don't see money.
  const isTradeParty = order.viewerIsBuyer || order.viewerIsSeller;
  const orderPayments = isTradeParty
    ? await api.get<OrderPayments>(`/orders/${id}/payments`).catch(() => null)
    : null;
  const role = order.viewerRole;
  // Phase 2 §1–3: seller + forwarder run the lifecycle; transporter and
  // clearing agent drive their own legs; buyer confirms final receipt.
  const canUpdateShipment =
    role === "seller" ||
    role === "admin" ||
    role === "FORWARDER" ||
    role === "TRANSPORTER" ||
    role === "CLEARING_AGENT" ||
    (role === "buyer" && order.status === "DELIVERED");
  const canManageFreight = role === "seller" || role === "FORWARDER" || role === "admin";
  const canRecordLocation =
    role === "seller" || role === "FORWARDER" || role === "TRANSPORTER" || role === "admin";
  const canCapturePod =
    !order.pod &&
    canRecordLocation &&
    ["OUT_FOR_DELIVERY", "DELIVERED", "DELIVERY_CONFIRMED"].includes(order.status);
  const counterparty = order.viewerIsSeller ? order.buyerCompany : order.sellerCompany;
  const lastEvent = order.statusEvents[0];
  // Earliest event per stage = the date each checkpoint was reached.
  const reachedAt: Partial<Record<OrderDetail["status"], string>> = {};
  for (const event of [...order.statusEvents].reverse()) {
    if (!reachedAt[event.status]) reachedAt[event.status] = event.createdAt;
  }
  const delayed = order.eta
    ? new Date(order.eta) < new Date() &&
      order.status !== "DELIVERED" &&
      order.status !== "DELIVERY_CONFIRMED"
    : false;
  const documentsByKind = ORDER_DOCUMENT_KINDS.map((kind) => ({
    kind,
    docs: documents.filter((d) => d.kind === kind),
  })).filter((g) => g.docs.length > 0);
  const podPhotoDocs = documents
    .filter((d) => d.kind === "PROOF_OF_DELIVERY_PHOTO" && d.status === "ACTIVE")
    .map((d) => ({ id: d.id, fileName: d.fileName }));
  const missingDocs = order.documentChecklist.filter((c) => !c.present);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader
        title={`Order ${order.orderNo}`}
        description={`${order.title} · from RFQ ${order.rfq.refNo}`}
      >
        <div className="flex items-center gap-2">
          {order.coldChain && (
            <Badge variant="info">
              <Snowflake className="size-3" /> Cold chain
            </Badge>
          )}
          <OrderStatusBadge status={order.status} />
          {order.viewerIsBuyer && ["DELIVERED", "DELIVERY_CONFIRMED"].includes(order.status) && (
            <RateEngagementButton
              orderId={order.id}
              targets={[
                {
                  companyId: order.sellerCompany.id,
                  companyName: order.sellerCompany.name,
                  role: "SELLER" as const,
                },
                ...order.appointments.map((a) => ({
                  companyId: a.company.id,
                  companyName: a.company.name,
                  role: a.role,
                })),
              ]}
            />
          )}
          {role !== "admin" && (
            <MessageCounterpartyButton
              orderId={order.id}
              counterpartyName={order.viewerIsBuyer ? counterparty.name : order.buyerCompany.name}
            />
          )}
        </div>
      </PageHeader>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm">Shipment progress</CardTitle>
            <CardDescription className="flex flex-wrap items-center gap-1.5">
              <span>
                {order.eta ? `ETA ${fmtDate(order.eta)}` : "ETA not yet available"}
                {order.freightMode ? ` · ${FREIGHT_MODE_LABELS[order.freightMode]}` : ""}
                {lastEvent ? ` · last updated ${fmtDateTime(lastEvent.createdAt)}` : ""}
              </span>
              {delayed && <Badge variant="destructive">Past ETA</Badge>}
            </CardDescription>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {canManageFreight && <FreightButton order={order} />}
            {(role === "seller" || role === "FORWARDER" || role === "admin") && (
              <EtaButton order={order} />
            )}
            {role !== "buyer" && role !== "admin" && <ExceptionButton orderId={order.id} />}
            {canUpdateShipment && (
              <StatusUpdateButton order={order} isSuperAdmin={me.isSuperAdmin} />
            )}
          </div>
        </CardHeader>
        <CardContent>
          <ShipmentTracker status={order.status} reachedAt={reachedAt} />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Logistics partners (Phase 2 §2) */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm">Logistics partners</CardTitle>
              <CardDescription>
                Appointed by the buyer; each partner sees exactly this shipment.
              </CardDescription>
            </div>
            {order.viewerIsBuyer && <AppointPartnerButton orderId={order.id} />}
          </CardHeader>
          <CardContent>
            {order.appointments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No forwarder, clearing agent or transporter appointed yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {order.appointments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 text-sm">
                    <div>
                      <p className="font-medium">{a.company.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {LOGISTICS_ROLE_LABELS[a.role]} · since {fmtDate(a.createdAt)}
                      </p>
                    </div>
                    {order.viewerIsBuyer && (
                      <RevokeAppointmentButton orderId={order.id} appointment={a} />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Document checklist (Phase 2 §2) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Shipment document checklist</CardTitle>
            <CardDescription>
              {order.dangerousGoods
                ? "Hazard-classified goods detected — a Dangerous Goods Declaration is required."
                : order.phytoRequired
                  ? "This category requires a Phytosanitary Certificate."
                  : "Required before customs, based on freight mode and cargo."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {order.documentChecklist.map((item) => (
                <li key={item.kind} className="flex items-center gap-2 text-sm">
                  <span
                    className={cn(
                      "flex size-5 items-center justify-center rounded-full border",
                      item.present
                        ? "border-success bg-success text-white"
                        : "border-border text-transparent",
                    )}
                  >
                    <Check className="size-3" />
                  </span>
                  <span className={item.present ? "" : "text-muted-foreground"}>
                    {DOCUMENT_KIND_LABELS[item.kind as DocumentKind] ?? item.kind}
                  </span>
                </li>
              ))}
            </ul>
            {missingDocs.length > 0 && (
              <p className="mt-3 text-xs text-warning">
                {missingDocs.length} document(s) still needed — upload them below.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* GPS tracking + POD (Phase 2 §3) */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Route tracking</CardTitle>
            <CardDescription>
              GPS positions on road legs, with historical playback. Updates expected at least every
              6 hours while moving.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LocationsCard order={order} canRecord={canRecordLocation} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm">Proof of delivery</CardTitle>
              <CardDescription>Photo and/or signature, captured at the door.</CardDescription>
            </div>
            {canCapturePod && <PodButton order={order} photoDocs={podPhotoDocs} />}
          </CardHeader>
          <CardContent>
            {order.pod ? (
              <div className="space-y-2 text-sm">
                <p>
                  Received by <span className="font-medium">{order.pod.signedByName}</span>
                  {" · "}
                  {fmtDateTime(order.pod.capturedAt)} · recorded by {order.pod.capturedBy.name}
                </p>
                {order.pod.signatureData && (
                  // biome-ignore lint/performance/noImgElement: inline data-URI signature — next/image adds nothing
                  <img
                    src={order.pod.signatureData}
                    alt={`Signature of ${order.pod.signedByName}`}
                    className="h-20 rounded-lg border bg-white"
                  />
                )}
                {order.pod.photoDocumentId && (
                  <DocumentChip id={order.pod.photoDocumentId} fileName="Delivery photo" />
                )}
                {order.pod.note && <p className="text-muted-foreground">{order.pod.note}</p>}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Not captured yet — available once the shipment is out for delivery.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

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
              <details open>
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground select-none">
                  {order.statusEvents.length} update(s), oldest first — click to collapse
                </summary>
                <ol className="mt-3 space-y-3">
                  {[...order.statusEvents].reverse().map((event) => (
                    <li
                      key={event.id}
                      className={cn(
                        "border-l-2 pl-3 text-sm",
                        event.exception ? "border-warning" : "border-border",
                      )}
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        {event.exception ? (
                          <Badge variant="warning">
                            {SHIPMENT_EXCEPTION_LABELS[event.exception as ShipmentException] ??
                              event.exception}
                          </Badge>
                        ) : (
                          <OrderStatusBadge status={event.status} />
                        )}
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
              </details>
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
            {ORDER_DOCUMENT_KINDS.map((kind) => (
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

      {/* Payments & invoice (Phase 3 §1–2) */}
      {orderPayments && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm">Payments & invoice</CardTitle>
              <CardDescription>
                {fmtMoney(orderPayments.paid, orderPayments.currency)} of{" "}
                {fmtMoney(orderPayments.total, orderPayments.currency)} confirmed ·{" "}
                {orderPayments.balance <= 0
                  ? "fully paid"
                  : `${fmtMoney(orderPayments.balance, orderPayments.currency)} outstanding`}
              </CardDescription>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {order.viewerIsSeller && <IssueInvoiceButton orderId={order.id} />}
              {order.viewerIsBuyer && (
                <RecordPaymentButton
                  orderId={order.id}
                  currency={orderPayments.currency}
                  balance={orderPayments.balance}
                />
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="mb-3 h-2 rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-success"
                style={{
                  width: `${Math.min(100, Math.round((orderPayments.paid / Math.max(1, orderPayments.total)) * 100))}%`,
                }}
              />
            </div>
            {orderPayments.payments.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No payments recorded yet. Payments move directly between the parties — the platform
                never holds funds.
              </p>
            ) : (
              <ul className="space-y-2">
                {orderPayments.payments.map((p) => (
                  <li
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 text-sm"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <PaymentStatusBadge status={p.status} />
                      <span className="font-medium tabular-nums">
                        {fmtMoney(p.amount, p.currency)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {p.providerRef} · {fmtDate(p.createdAt)}
                        {p.failureReason ? ` · ${p.failureReason}` : ""}
                      </span>
                    </div>
                    <PaymentActions
                      payment={p}
                      viewerIsSeller={order.viewerIsSeller}
                      viewerIsBuyer={order.viewerIsBuyer}
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* Traceability ledger (Phase 5 §2) */}
      <TraceCard orderId={order.id} />

      {/* Exceptions & disputes (Phase 2 §4) */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle className="text-sm">Disputes & complaints</CardTitle>
            <CardDescription>
              Formal complaints on this shipment, escalatable to the platform team; the full trail
              is audited.
            </CardDescription>
          </div>
          {role !== "admin" && <DisputeButtons orderId={order.id} />}
        </CardHeader>
        <CardContent>
          <DisputeList
            disputes={order.disputes}
            viewerCompanyId={me.membership?.companyId ?? null}
          />
        </CardContent>
      </Card>
    </div>
  );
}
