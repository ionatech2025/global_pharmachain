import { Badge } from "@pharmachain/ui/components/badge";
import { Button } from "@pharmachain/ui/components/button";
import { Input } from "@pharmachain/ui/components/input";
import { Skeleton } from "@pharmachain/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@pharmachain/ui/components/table";
import Link from "next/link";
import { Suspense } from "react";
import { CompareButton, CompareTray } from "@/components/compare";
import { DocumentChip } from "@/components/document-chip";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { PaginationNav } from "@/components/pagination-nav";
import { SavedSearches } from "@/components/saved-searches";
import type { ApiClient } from "@/lib/api/http";
import { apiServer, getViewer } from "@/lib/api/server";
import type { CategoryRow, ExchangeRateRow, ListingRow, Paginated } from "@/lib/api/types";
import { approxInPreferred, convertedPrices, fmtMoney } from "@/lib/format";

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
  // Only /catalogue/search depends on the filters — categories, rates and
  // the viewer's currency preference are the same regardless of what's
  // typed into the form, so they don't belong behind the same Suspense
  // boundary as the results (previously all four were one Promise.all,
  // which meant every filter change re-rendered this whole route behind
  // one route-level fallback — the filter form and header vanished along
  // with the results grid on every search, not just the part that changed).
  const [categories, rates, me] = await Promise.all([
    api.get<CategoryRow[]>("/catalogue/categories"),
    api.get<ExchangeRateRow[]>("/catalogue/exchange-rates"),
    getViewer(),
  ]);
  const preferredCurrency = me.preferredCurrency ?? null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Marketplace"
        description="Search verified suppliers' published listings."
      />

      <form className="flex flex-wrap items-end gap-2" action="/marketplace" method="get">
        <div className="min-w-56 flex-1">
          <Input
            name="q"
            aria-label="Search products"
            placeholder="Product or chemical name, CAS number…"
            defaultValue={params.q}
          />
        </div>
        <select
          name="categoryId"
          aria-label="Filter by category"
          defaultValue={params.categoryId ?? ""}
          className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm transition-[border-color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50"
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
          className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm transition-[border-color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="">Raw materials & products</option>
          <option value="RAW_MATERIAL">Raw materials</option>
          <option value="FINISHED_PRODUCT">Finished products</option>
        </select>
        <Input
          name="country"
          aria-label="Country of origin"
          placeholder="Country of origin"
          defaultValue={params.country}
          className="w-40"
        />
        <select
          name="sort"
          aria-label="Sort results"
          defaultValue={params.sort ?? "relevance"}
          className="h-10 rounded-lg border border-input bg-transparent px-3 text-sm transition-[border-color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="relevance">Sort: relevance</option>
          <option value="company">Sort: company name</option>
        </select>
        <Button type="submit" variant="secondary">
          Search
        </Button>
      </form>

      <FilterChips params={params} categories={categories} />
      <SavedSearches
        current={{
          q: params.q,
          kind: params.kind,
          categoryId: params.categoryId,
          country: params.country,
        }}
      />

      <Suspense
        key={`${params.q ?? ""}|${params.kind ?? ""}|${params.categoryId ?? ""}|${params.country ?? ""}|${params.sort ?? ""}|${params.page ?? ""}`}
        fallback={<MarketplaceResultsSkeleton />}
      >
        <MarketplaceResults
          api={api}
          params={params}
          rates={rates}
          preferredCurrency={preferredCurrency}
        />
      </Suspense>
      <CompareTray />
    </div>
  );
}

/** The one part of the page that actually depends on the filters — kept
 *  behind its own Suspense boundary so a search re-fetches just this,
 *  not the header/form/chips above it. */
async function MarketplaceResults({
  api,
  params,
  rates,
  preferredCurrency,
}: {
  api: ApiClient;
  params: SearchParams;
  rates: ExchangeRateRow[];
  preferredCurrency: string | null;
}) {
  const results = await api.get<Paginated<ListingRow>>("/catalogue/search", {
    query: {
      q: params.q,
      kind: params.kind,
      categoryId: params.categoryId,
      country: params.country,
      sort: params.sort,
      page: params.page ?? 1,
    },
  });

  if (results.items.length === 0) {
    return (
      <EmptyState
        title="No matches found"
        hint="Try broadening your filters — only listings from verified companies appear here."
      />
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Listing</TableHead>
            <TableHead>Supplier</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Origin</TableHead>
            <TableHead>Price</TableHead>
            <TableHead>COA</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.items.map((l) => (
            <TableRow key={l.id}>
              <TableCell className="font-medium">
                {/* QA finding: the table only opened the *company*, but the
                    buyer's interest is the product. The listing name is now
                    the primary link; the supplier column still opens the
                    company profile. */}
                <Link href={`/marketplace/${l.id}`} className="text-primary hover:underline">
                  {l.name}
                </Link>
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
                {/* Phase 3 §3: viewer's preferred display currency, inline */}
                {approxInPreferred(l.price, l.currency, preferredCurrency, rates) && (
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {approxInPreferred(l.price, l.currency, preferredCurrency, rates)}
                  </div>
                )}
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
                {/* The Certificate of Analysis is what buyers shortlist on,
                    so it holds the column. The SDS hazard warning stays —
                    it is a safety signal, not a quality one — but sits
                    underneath rather than taking the header. */}
                {l.coaDocument ? (
                  <DocumentChip id={l.coaDocument.id} fileName={l.coaDocument.fileName} />
                ) : (
                  <span className="text-xs text-muted-foreground">No COA</span>
                )}
                {l.sdsMissing && (
                  <Badge variant="warning" className="mt-1">
                    SDS missing
                  </Badge>
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
  );
}

function MarketplaceResultsSkeleton() {
  return (
    <div className="space-y-2 pt-2" role="status" aria-busy="true" aria-label="Loading results">
      <Skeleton className="h-9 w-full" />
      {Array.from({ length: 6 }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder list
        <Skeleton key={i} className="h-11 w-full" style={{ opacity: 1 - i * 0.09 }} />
      ))}
    </div>
  );
}

/** Applied-filter chips: each removes its own param; Clear all resets. */
function FilterChips({ params, categories }: { params: SearchParams; categories: CategoryRow[] }) {
  const active: Array<{ key: keyof SearchParams; label: string }> = [];
  if (params.q) active.push({ key: "q", label: `"${params.q}"` });
  if (params.categoryId) {
    const name = categories.find((c) => c.id === params.categoryId)?.name ?? "Category";
    active.push({ key: "categoryId", label: name });
  }
  if (params.kind)
    active.push({ key: "kind", label: params.kind.replaceAll("_", " ").toLowerCase() });
  if (params.country) active.push({ key: "country", label: params.country });
  if (active.length === 0) return null;

  const hrefWithout = (key: keyof SearchParams) => {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v && k !== key && k !== "page") search.set(k, v);
    }
    const qs = search.toString();
    return qs ? `/marketplace?${qs}` : "/marketplace";
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted-foreground">Filters:</span>
      {active.map((f) => (
        <Link
          key={f.key}
          href={hrefWithout(f.key)}
          className="inline-flex items-center gap-1 rounded-full border bg-card px-2.5 py-0.5 text-xs font-medium transition-colors hover:border-destructive/40 hover:text-destructive"
          aria-label={`Remove filter ${f.label}`}
        >
          {f.label}
          <span aria-hidden>×</span>
        </Link>
      ))}
      <Link
        href="/marketplace"
        className="text-xs text-muted-foreground underline-offset-2 hover:underline"
      >
        Clear all
      </Link>
    </div>
  );
}
