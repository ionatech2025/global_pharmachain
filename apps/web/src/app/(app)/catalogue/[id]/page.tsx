import { Badge } from "@pharmachain/ui/components/badge";
import { Button } from "@pharmachain/ui/components/button";
import { Card, CardContent, CardHeader, CardTitle } from "@pharmachain/ui/components/card";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { UploadButton } from "@/components/upload-button";
import { ApiClientError } from "@/lib/api/http";
import { apiServer } from "@/lib/api/server";
import type { CategoryRow, ListingRow } from "@/lib/api/types";
import { ListingRowActions } from "../listing-actions";
import { ListingForm } from "../listing-form";

export const metadata = { title: "Listing" };

export default async function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const api = await apiServer();

  // Both reads are independent, so they go out together rather than one
  // round trip after the other — every API call here is a network hop.
  const [listingResult, categories] = await Promise.all([
    api.get<ListingRow>(`/catalogue/${id}`).catch((err: unknown) => err),
    api.get<CategoryRow[]>("/catalogue/categories"),
  ]);
  if (listingResult instanceof Error) {
    if (listingResult instanceof ApiClientError && listingResult.status === 404) notFound();
    throw listingResult;
  }
  const listing = listingResult as ListingRow;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        backHref="/catalogue"
        backLabel="My catalogue"
        title={listing.name}
        description={`Status: ${listing.status.toLowerCase()}`}
      >
        <ListingRowActions listingId={listing.id} status={listing.status} kind={listing.kind} />
      </PageHeader>

      {/*
       * QA Figure 11: the marketplace leads on the Certificate of Analysis,
       * so it is uploaded here alongside the SDS and travels with the listing.
       */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-sm">Certificate of Analysis (COA)</CardTitle>
          <UploadButton
            kind="CERTIFICATE_OF_ANALYSIS"
            label={listing.coaDocument ? "Replace COA" : "Upload COA"}
            links={{ listingId: listing.id }}
            replacesDocumentId={listing.coaDocument?.id}
          />
        </CardHeader>
        <CardContent className="text-sm">
          {listing.coaDocument ? (
            <p className="text-muted-foreground">
              Current: {listing.coaDocument.fileName} (v{listing.coaDocument.version}) — shown to
              buyers in the marketplace; prior versions are retained.
            </p>
          ) : (
            <p className="text-muted-foreground">
              No COA uploaded. Buyers compare listings on it, so publishing one materially improves
              this listing's standing in search results.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-sm">Safety Data Sheet (SDS/MSDS)</CardTitle>
          <UploadButton
            kind="SDS"
            label={listing.hasSds ? "Replace SDS" : "Upload SDS"}
            links={{ listingId: listing.id }}
            replacesDocumentId={listing.documents[0]?.id}
          />
        </CardHeader>
        <CardContent className="text-sm">
          {listing.sdsMissing && (
            <Badge variant="warning" className="mb-2">
              Hazard-classified material without SDS — buyers see a warning
            </Badge>
          )}
          {listing.hasSds ? (
            <p className="text-muted-foreground">
              Current: {listing.documents[0]?.fileName} (v{listing.documents[0]?.version}) — prior
              versions are retained.
            </p>
          ) : (
            <p className="text-muted-foreground">No SDS uploaded (PDF only, max 10MB).</p>
          )}
        </CardContent>
      </Card>

      {listing.kind === "FINISHED_PRODUCT" && (
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle className="text-sm">Bill of Materials</CardTitle>
            <Button asChild size="sm" variant="outline">
              <Link href={`/catalogue/${listing.id}/bom`}>Manage BOM</Link>
            </Button>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Link raw-material requirements to this product for structured sourcing.
          </CardContent>
        </Card>
      )}

      <ListingForm
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        existing={listing}
      />
    </div>
  );
}
