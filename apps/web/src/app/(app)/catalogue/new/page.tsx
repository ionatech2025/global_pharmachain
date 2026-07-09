import { PageHeader } from "@/components/page-header";
import { apiServer } from "@/lib/api/server";
import type { CategoryRow } from "@/lib/api/types";
import { ListingForm } from "../listing-form";

export const metadata = { title: "Add listing" };

export default async function NewListingPage() {
  const api = await apiServer();
  const categories = await api.get<CategoryRow[]>("/catalogue/categories");

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        title="Add a listing"
        description="Rich technical detail helps buyers find and trust your listing (US-302)."
      />
      <ListingForm categories={categories.map((c) => ({ id: c.id, name: c.name }))} />
    </div>
  );
}
