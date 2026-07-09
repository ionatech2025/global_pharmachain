import { PageHeader } from "@/components/page-header";
import { apiServer } from "@/lib/api/server";
import type { CategoryRow } from "@/lib/api/types";
import { RfqForm } from "./rfq-form";

export const metadata = { title: "Raise RFQ" };

interface SearchParams {
  // Pre-fill support for "Raise RFQ" from a BOM line (US-802)
  bomItemId?: string;
  title?: string;
  categoryId?: string;
  unit?: string;
}

export default async function NewRfqPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const api = await apiServer();
  const categories = await api.get<CategoryRow[]>("/catalogue/categories");

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title="Raise an RFQ"
        description="Visible only to verified companies in the target category (US-401)."
      />
      <RfqForm
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        prefill={{
          bomItemId: params.bomItemId,
          title: params.title,
          categoryId: params.categoryId,
          unit: params.unit,
        }}
      />
    </div>
  );
}
