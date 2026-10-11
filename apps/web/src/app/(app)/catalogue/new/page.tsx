import { PageHeader } from "@/components/page-header";
import { getCategories, getExchangeRates } from "@/lib/api/reference";
import { ListingForm } from "../listing-form";

export const metadata = { title: "Add listing" };

export default async function NewListingPage() {
  const [categories, rates] = await Promise.all([
    getCategories(),
    getExchangeRates().catch(() => []),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageHeader
        backHref="/catalogue"
        backLabel="My catalogue"
        title="Add a listing"
        description="Rich technical detail helps buyers find and trust your listing. Save it, then attach the Certificate of Analysis and SDS on the next screen."
      />
      <ListingForm categories={categories.map((c) => ({ id: c.id, name: c.name }))} rates={rates} />
    </div>
  );
}
