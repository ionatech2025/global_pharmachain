"use client";

import { MARKETPLACE_SORT_LABELS, MARKETPLACE_SORTS } from "@pharmachain/core";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { LiveSearch } from "@/components/live-search";

const SELECT_CLASS =
  "h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm transition-[border-color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:opacity-50";

export interface MarketplaceFilterValues {
  categoryId?: string;
  kind?: string;
  country?: string;
  sort?: string;
}

/**
 * The marketplace search box and filters, applied as they change.
 *
 * Client review 2026-11-06: "When a user filters, they have to click the
 * 'Search' button to get the filtered results, yet the 'Search' button looks
 * to be for the search field … Better would be if the results from the filter
 * come, even without pressing the button." So there is no button: each filter
 * navigates the moment it changes, and the search box follows what is typed
 * (LiveSearch, debounced). The URL stays the source of truth — every result
 * set is still a shareable link, and the chips below still remove filters.
 */
export function MarketplaceFilters({
  values,
  categories,
  origins,
}: {
  values: MarketplaceFilterValues;
  categories: Array<{ id: string; name: string }>;
  origins: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  function apply(name: keyof MarketplaceFilterValues, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    // "Featured first" is the default order; keep the URL clean.
    if (value && !(name === "sort" && value === "relevance")) next.set(name, value);
    else next.delete(name);
    // A narrower result set must start at page 1, or it can land on an empty page.
    next.delete("page");
    const qs = next.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  // Remount a select when its URL value changes from elsewhere (a removed
  // chip, Back), so it always shows what the results are filtered by.
  const select = (name: keyof MarketplaceFilterValues, value: string | undefined) => ({
    id: `mp-${name}`,
    name,
    defaultValue: value ?? "",
    className: SELECT_CLASS,
    onChange: (e: React.ChangeEvent<HTMLSelectElement>) => apply(name, e.target.value),
  });

  return (
    <div role="search" className="panel space-y-3 p-4" aria-label="Search the marketplace">
      <LiveSearch
        label="Search products"
        placeholder="Product or chemical name, CAS number…"
        className="w-full"
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Category" htmlFor="mp-categoryId">
          <select
            key={`categoryId:${values.categoryId ?? ""}`}
            {...select("categoryId", values.categoryId)}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Listing type" htmlFor="mp-kind">
          <select key={`kind:${values.kind ?? ""}`} {...select("kind", values.kind)}>
            <option value="">Raw materials & products</option>
            <option value="RAW_MATERIAL">Raw materials</option>
            <option value="FINISHED_PRODUCT">Finished products</option>
          </select>
        </Field>
        <Field label="Country of origin" htmlFor="mp-country">
          <select key={`country:${values.country ?? ""}`} {...select("country", values.country)}>
            <option value="">Any country</option>
            {/* A value from an older link that no listing carries any more still
                shows as selected, rather than silently becoming "Any country". */}
            {values.country &&
              !origins.some((o) => o.toLowerCase() === values.country?.toLowerCase()) && (
                <option value={values.country}>{values.country}</option>
              )}
            {origins.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Sort by" htmlFor="mp-sort">
          <select key={`sort:${values.sort ?? ""}`} {...select("sort", values.sort ?? "relevance")}>
            {MARKETPLACE_SORTS.map((sort) => (
              <option key={sort} value={sort}>
                {MARKETPLACE_SORT_LABELS[sort]}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="text-xs text-muted-foreground" role="status" aria-live="polite">
        {pending
          ? "Updating results…"
          : "Results update as you type or change a filter — no button to press."}
      </p>
    </div>
  );
}

/** A labelled filter: the label is visible, so the control's purpose survives a chosen value. */
function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}
