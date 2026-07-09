import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ApiClientError } from "@/lib/api/http";
import { apiServer } from "@/lib/api/server";
import type { BomRow, CategoryRow, ListingRow } from "@/lib/api/types";
import { BomManager } from "./bom-manager";

export const metadata = { title: "Bill of Materials" };

export default async function BomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const api = await apiServer();

  let listing: ListingRow;
  try {
    listing = await api.get<ListingRow>(`/catalogue/${id}`);
  } catch (err) {
    if (err instanceof ApiClientError && err.status === 404) notFound();
    throw err;
  }
  const [boms, categories] = await Promise.all([
    api.get<BomRow[]>("/boms", { query: { productListingId: id } }),
    api.get<CategoryRow[]>("/catalogue/categories"),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title={`BOM — ${listing.name}`}
        description="Versions are never overwritten; one version is Active at a time (US-801/803)."
      />
      <BomManager
        productListingId={id}
        boms={boms}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      />
    </div>
  );
}
