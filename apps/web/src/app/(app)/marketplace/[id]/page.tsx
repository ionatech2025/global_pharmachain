import { LISTING_KIND_LABELS } from "@pharmachain/core";
import { Badge } from "@pharmachain/ui/components/badge";
import { Button } from "@pharmachain/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@pharmachain/ui/components/card";
import { Building2, Send, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentChip } from "@/components/document-chip";
import { PageHeader } from "@/components/page-header";
import { ApiClientError } from "@/lib/api/http";
import { apiServer, getViewer } from "@/lib/api/server";
import type { ExchangeRateRow, ListingRow } from "@/lib/api/types";
import { approxInPreferred, convertedPrices, fmtMoney } from "@/lib/format";

export const metadata = { title: "Product" };

/**
 * Public product detail (QA Figure 9): the marketplace table could only open a
 * *company*, so the thing a buyer is actually shopping for had no page of its
 * own. Everything a sourcing decision needs — specification, packaging,
 * storage, standards, quality documents and the supplier — lives here.
 */
export default async function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const api = await apiServer();

  let listing: ListingRow;
  try {
    listing = await api.get<ListingRow>(`/catalogue/${id}`);
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 404) notFound();
    throw err;
  }
  const [rates, me] = await Promise.all([
    api.get<ExchangeRateRow[]>("/catalogue/exchange-rates").catch(() => []),
    getViewer().catch(() => null),
  ]);
  const preferred = approxInPreferred(
    listing.price,
    listing.currency,
    me?.preferredCurrency ?? null,
    rates,
  );

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader
        backHref="/marketplace"
        backLabel="Marketplace"
        eyebrow={LISTING_KIND_LABELS[listing.kind]}
        title={listing.name}
        description={
          listing.casNumber
            ? `CAS ${listing.casNumber} · ${listing.category.name}`
            : listing.category.name
        }
      >
        {/* Pre-fills the RFQ form from this listing, so sourcing a product
            you found here is one click rather than a re-type. */}
        <Button asChild size="sm">
          <Link
            href={`/rfqs/new?${new URLSearchParams({
              title: listing.name,
              categoryId: listing.category.id,
              unit: listing.unit,
            })}`}
          >
            <Send className="size-3.5" /> Request a quotation
          </Link>
        </Button>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Specification</CardTitle>
            {listing.description && <CardDescription>{listing.description}</CardDescription>}
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
              <Field label="Country of origin" value={listing.countryOfOrigin} />
              <Field label="Packaging" value={listing.packagingType} />
              <Field label="Pack size" value={listing.packSize} />
              <Field label="Unit" value={listing.unit} />
              <Field label="HS code" value={listing.hsCode} />
              <Field
                label="Shelf life"
                value={listing.shelfLifeMonths ? `${listing.shelfLifeMonths} months` : null}
              />
              <Field label="Storage" value={listing.storageConditions} />
              <Field label="GHS classification" value={listing.ghsClassification} />
            </dl>

            {(listing.standards?.length ?? 0) > 0 && (
              <div className="mt-4">
                <p className="text-xs text-muted-foreground">Pharmacopoeia standards</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {listing.standards.map((standard) => (
                    <Badge key={standard} variant="info">
                      {standard}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            {listing.certifications.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-muted-foreground">Certifications</p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {listing.certifications.map((certification) => (
                    <Badge key={certification} variant="outline">
                      {certification}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Price</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="figure text-2xl">
                {fmtMoney(listing.price, listing.currency)}
                <span className="ml-1 text-sm font-normal text-muted-foreground">
                  / {listing.unit}
                </span>
              </p>
              {preferred && (
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">{preferred}</p>
              )}
              {rates.length > 0 && (
                <details className="mt-2">
                  <summary className="w-fit cursor-pointer list-none text-xs text-muted-foreground hover:text-foreground">
                    ≈ other currencies
                  </summary>
                  <div className="mt-1 space-y-0.5 text-xs tabular-nums text-muted-foreground">
                    {convertedPrices(listing.price, listing.currency, rates).map((c) => (
                      <div key={c}>≈ {c}</div>
                    ))}
                  </div>
                </details>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                Indicative list price — raise an RFQ for a binding quotation at your volume.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Quality documents</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Certificate of Analysis</p>
                {listing.coaDocument ? (
                  <DocumentChip
                    id={listing.coaDocument.id}
                    fileName={listing.coaDocument.fileName}
                  />
                ) : (
                  <p className="text-muted-foreground">Not published for this listing.</p>
                )}
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Safety Data Sheet</p>
                {listing.documents[0] ? (
                  <DocumentChip
                    id={listing.documents[0].id}
                    fileName={listing.documents[0].fileName}
                  />
                ) : listing.sdsMissing ? (
                  <Badge variant="warning">Hazard-classified without an SDS</Badge>
                ) : (
                  <p className="text-muted-foreground">Not published for this listing.</p>
                )}
              </div>
            </CardContent>
          </Card>

          {listing.company && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Supplier</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Link
                  href={`/companies/${listing.company.id}`}
                  className="flex items-center gap-2 font-medium text-primary hover:underline"
                >
                  <Building2 className="size-4 shrink-0" aria-hidden />
                  {listing.company.name}
                </Link>
                {listing.company.country && (
                  <p className="text-muted-foreground">{listing.company.country}</p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="success">
                    <ShieldCheck className="size-3" /> Verified
                  </Badge>
                  {listing.company.subscriptionTier &&
                    listing.company.subscriptionTier !== "FREEMIUM" && (
                      <Badge variant="warning">
                        {listing.company.subscriptionTier === "FEATURED" ? "Featured" : "Premium"}
                      </Badge>
                    )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{value || "—"}</dd>
    </div>
  );
}
