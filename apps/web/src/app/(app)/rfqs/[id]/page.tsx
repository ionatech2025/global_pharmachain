import { Card, CardContent, CardHeader, CardTitle } from "@pharmachain/ui/components/card";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentChip } from "@/components/document-chip";
import { PageHeader } from "@/components/page-header";
import { RfqStatusBadge } from "@/components/status-badge";
import { ApiClientError } from "@/lib/api/http";
import { apiServer } from "@/lib/api/server";
import type { QuotationRow, RfqDetail } from "@/lib/api/types";
import { fmtDate, fmtNumber } from "@/lib/format";
import { BuyerQuotations, CancelRfqButton, SupplierQuotePanel } from "./panels";

export const metadata = { title: "RFQ" };

export default async function RfqDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const api = await apiServer();

  let rfq: RfqDetail;
  try {
    rfq = await api.get<RfqDetail>(`/rfqs/${id}`);
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 404) notFound();
    throw err;
  }

  const quotations = rfq.viewerIsBuyer
    ? await api.get<QuotationRow[]>(`/rfqs/${id}/quotations`, { query: { sort: "price" } })
    : [];

  return (
    <div className="space-y-4">
      {/*
       * Which side of this RFQ you are on decides what the page does, so it is
       * stated rather than implied. A supplier reaching this page from the
       * Quote inbox sees a quotation form; QA read that as the buyer being
       * asked to resubmit someone else's quote. The eyebrow and the back link
       * both name the role, so the panel below is never a surprise.
       */}
      <PageHeader
        backHref={rfq.viewerIsBuyer ? "/rfqs" : "/quotes"}
        backLabel={rfq.viewerIsBuyer ? "My RFQs" : "Quote inbox"}
        eyebrow={rfq.viewerIsBuyer ? "RFQ you raised" : "RFQ you can quote on"}
        title={`${rfq.refNo} — ${rfq.title}`}
        description={
          rfq.viewerIsBuyer
            ? `Raised by your company · ${rfq.buyerCompany.name}`
            : `Buyer: ${rfq.buyerCompany.name}`
        }
      >
        <RfqStatusBadge status={rfq.status} />
        {rfq.viewerIsBuyer && rfq.status === "OPEN" && <CancelRfqButton rfqId={rfq.id} />}
      </PageHeader>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm">Requirement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Quantity:</span> {fmtNumber(rfq.quantity)}{" "}
              {rfq.unit}
            </p>
            <p>
              <span className="text-muted-foreground">Category:</span> {rfq.category?.name ?? "Any"}
            </p>
            <p>
              <span className="text-muted-foreground">Deadline:</span> {fmtDate(rfq.deadline)}
            </p>
            <p>
              <span className="text-muted-foreground">Visible suppliers:</span>{" "}
              {rfq.visibleSupplierCount}
            </p>
            {rfq.specifications && (
              <div>
                <p className="text-muted-foreground">Specifications:</p>
                <p className="whitespace-pre-wrap">{rfq.specifications}</p>
              </div>
            )}
            {rfq.documents.length > 0 && (
              <div className="space-y-1">
                <p className="text-muted-foreground">Attachments:</p>
                {rfq.documents.map((d) => (
                  <DocumentChip key={d.id} id={d.id} fileName={d.fileName} />
                ))}
              </div>
            )}
            {rfq.bomItem && (
              <p className="text-xs text-muted-foreground">
                Raised from BOM line “{rfq.bomItem.materialName}”.
              </p>
            )}
            {rfq.order && (
              <p>
                <span className="text-muted-foreground">Awarded order:</span>{" "}
                <Link href={`/orders/${rfq.order.id}`} className="text-primary underline">
                  {rfq.order.orderNo}
                </Link>
              </p>
            )}
          </CardContent>
        </Card>

        <div className="lg:col-span-2">
          {rfq.viewerIsBuyer ? (
            <BuyerQuotations
              rfqId={rfq.id}
              rfqStatus={rfq.status}
              quantity={rfq.quantity}
              unit={rfq.unit}
              initial={quotations}
            />
          ) : (
            <SupplierQuotePanel rfq={rfq} />
          )}
        </div>
      </div>
    </div>
  );
}
