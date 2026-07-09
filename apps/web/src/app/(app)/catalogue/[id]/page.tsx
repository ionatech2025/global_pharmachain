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

  let listing: ListingRow;
  try {
    listing = await api.get<ListingRow>(`/catalogue/${id}`);
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 404) notFound();
    throw err;
  }
  const categories = await api.get<CategoryRow[]>("/catalogue/categories");

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader title={listing.name} description={`Status: ${listing.status.toLowerCase()}`}>
        <ListingRowActions listingId={listing.id} status={listing.status} kind={listing.kind} />
      </PageHeader>

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
              Hazard-classified material without SDS — buyers see a warning (US-303)
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
            Link raw-material requirements to this product for structured sourcing (US-801).
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
