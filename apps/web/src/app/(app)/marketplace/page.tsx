import { Badge } from "@pharmachain/ui/components/badge";
import { Button } from "@pharmachain/ui/components/button";
import { Input } from "@pharmachain/ui/components/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@pharmachain/ui/components/table";
import Link from "next/link";
import { CompareButton, CompareTray } from "@/components/compare";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PaginationNav } from "@/components/pagination-nav";
import { apiServer } from "@/lib/api/server";
import type { CategoryRow, ExchangeRateRow, ListingRow, Paginated } from "@/lib/api/types";
import { convertedPrices, fmtMoney } from "@/lib/format";

export const metadata = { title: "Marketplace" };

interface SearchParams {
  q?: string;
  kind?: string;
  categoryId?: string;
  country?: string;
  page?: string;
  sort?: string;
}

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const api = await apiServer();
  const [results, categories, rates] = await Promise.all([
    api.get<Paginated<ListingRow>>("/catalogue/search", {
      query: {
        q: params.q,
        kind: params.kind,
        categoryId: params.categoryId,
        country: params.country,
        sort: params.sort,
        page: params.page ?? 1,
      },
    }),
    api.get<CategoryRow[]>("/catalogue/categories"),
    api.get<ExchangeRateRow[]>("/catalogue/exchange-rates"),
  ]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Marketplace"
        description="Search verified suppliers' published listings (US-304)."
      />

      <form className="flex flex-wrap items-end gap-2" action="/marketplace" method="get">
        <div className="min-w-56 flex-1">
          <Input
            name="q"
            placeholder="Product or chemical name, CAS number…"
            defaultValue={params.q}
          />
        </div>
        <select
          name="categoryId"
          aria-label="Filter by category"
          defaultValue={params.categoryId ?? ""}
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          name="kind"
          aria-label="Filter by listing kind"
          defaultValue={params.kind ?? ""}
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
        >
          <option value="">Raw materials & products</option>
          <option value="RAW_MATERIAL">Raw materials</option>
          <option value="FINISHED_PRODUCT">Finished products</option>
        </select>
        <Input
          name="country"
          placeholder="Country of origin"
          defaultValue={params.country}
          className="w-40"
        />
        <select
          name="sort"
          aria-label="Sort results"
          defaultValue={params.sort ?? "relevance"}
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
        >
          <option value="relevance">Sort: relevance</option>
          <option value="company">Sort: company name</option>
        </select>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      {results.items.length === 0 ? (
        <EmptyState
          title="No matches found"
          hint="Try broadening your filters — only listings from verified companies appear here."
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Listing</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Origin</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>SDS</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.items.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">
                    {l.name}
                    {l.casNumber && (
                      <span className="ml-2 text-xs text-muted-foreground">CAS {l.casNumber}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {l.company && (
                      <Link href={`/companies/${l.company.id}`} className="hover:underline">
                        {l.company.name}
                      </Link>
                    )}
                    {l.company?.subscriptionTier !== "FREEMIUM" && (
                      <Badge variant="warning" className="ml-2">
                        {l.company?.subscriptionTier === "FEATURED" ? "Featured" : "Premium"}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{l.category.name}</TableCell>
                  <TableCell className="text-muted-foreground">{l.countryOfOrigin}</TableCell>
                  <TableCell>
                    <div className="whitespace-nowrap font-medium tabular-nums">
                      {fmtMoney(l.price, l.currency)}{" "}
                      <span className="font-normal text-muted-foreground">/ {l.unit}</span>
                    </div>
                    {/* Conversions collapsed by default — keeps rows scannable
                        while the FX detail stays one click away (US-905). */}
                    {rates.length > 0 && (
                      <details className="mt-0.5">
                        <summary className="w-fit cursor-pointer list-none text-xs text-muted-foreground hover:text-foreground">
                          ≈ other currencies
                        </summary>
                        <div className="mt-1 space-y-0.5 text-xs tabular-nums text-muted-foreground">
                          {convertedPrices(l.price, l.currency, rates).map((c) => (
                            <div key={c}>≈ {c}</div>
                          ))}
                        </div>
                      </details>
                    )}
                  </TableCell>
                  <TableCell>
                    {l.sdsMissing ? (
                      <Badge variant="warning">SDS missing</Badge>
                    ) : l.hasSds ? (
                      <Badge variant="success">SDS</Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <CompareButton
                      item={{
                        id: l.id,
                        name: l.name,
                        company: l.company?.name ?? "",
                        price: `${fmtMoney(l.price, l.currency)} / ${l.unit}`,
                        origin: l.countryOfOrigin,
                        packaging: `${l.packagingType} · ${l.packSize}`,
                        certifications: l.certifications.join(", "),
                        companyId: l.company?.id,
                        verified: true,
                        shelfLife: l.shelfLifeMonths ? `${l.shelfLifeMonths} months` : undefined,
                        storage: l.storageConditions ?? undefined,
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <PaginationNav
            page={results.page}
            totalPages={results.totalPages}
            total={results.total}
            noun="listing(s)"
            basePath="/marketplace"
            params={{
              q: params.q,
              categoryId: params.categoryId,
              kind: params.kind,
              country: params.country,
              sort: params.sort,
            }}
          />
        </>
      )}
      <CompareTray />
    </div>
  );
}
