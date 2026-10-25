"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  CURRENCIES,
  convertAmount,
  type FxPair,
  fxRate,
  LISTING_KIND_LABELS,
  LISTING_KINDS,
  type ListingCreate,
  listingCreateSchema,
  PHARMACOPOEIA_STANDARDS,
} from "@pharmachain/core";
import { Button } from "@pharmachain/ui/components/button";
import { Card, CardContent } from "@pharmachain/ui/components/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@pharmachain/ui/components/form";
import { Input } from "@pharmachain/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@pharmachain/ui/components/select";
import { Textarea } from "@pharmachain/ui/components/textarea";
import { ArrowRightLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { api } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/http";
import type { ExchangeRateRow, ListingRow } from "@/lib/api/types";
import { fmtMoney, fmtNumber } from "@/lib/format";

const FALLBACK_RATES: FxPair[] = [
  { base: "USD", quote: "UGX", rate: 3820 },
  { base: "USD", quote: "KES", rate: 129.5 },
  { base: "USD", quote: "TZS", rate: 2680 },
  { base: "USD", quote: "RWF", rate: 1420 },
  { base: "USD", quote: "EUR", rate: 0.92 },
  { base: "USD", quote: "GBP", rate: 0.78 },
  { base: "USD", quote: "INR", rate: 84.1 },
  { base: "USD", quote: "CNY", rate: 7.21 },
];

export function ListingForm({
  categories,
  existing,
  rates: initialRates,
}: {
  categories: Array<{ id: string; name: string }>;
  existing?: ListingRow;
  rates?: ExchangeRateRow[];
}) {
  const router = useRouter();
  const [rates, setRates] = useState<ExchangeRateRow[]>(initialRates ?? []);

  useEffect(() => {
    if (!initialRates || initialRates.length === 0) {
      api
        .get<ExchangeRateRow[]>("/catalogue/exchange-rates")
        .then((data) => setRates(data))
        .catch(() => {});
    }
  }, [initialRates]);

  // Schema defaults (.default([])) make the form input wider than the parsed
  // output, so useForm needs both generics to line up with zodResolver.
  const form = useForm<z.input<typeof listingCreateSchema>, unknown, ListingCreate>({
    resolver: zodResolver(listingCreateSchema),
    defaultValues: existing
      ? {
          kind: existing.kind,
          name: existing.name,
          casNumber: existing.casNumber ?? undefined,
          ghsClassification: existing.ghsClassification ?? undefined,
          countryOfOrigin: existing.countryOfOrigin,
          packagingType: existing.packagingType,
          packSize: existing.packSize,
          unit: existing.unit,
          hsCode: existing.hsCode ?? undefined,
          shelfLifeMonths: existing.shelfLifeMonths ?? undefined,
          storageConditions: existing.storageConditions ?? undefined,
          certifications: existing.certifications,
          standards: (existing.standards ?? []) as ListingCreate["standards"],
          categoryId: existing.categoryId,
          price: existing.price,
          currency: existing.currency as ListingCreate["currency"],
          description: existing.description ?? undefined,
        }
      : {
          kind: "RAW_MATERIAL",
          name: "",
          countryOfOrigin: "",
          packagingType: "",
          packSize: "",
          unit: "kg",
          certifications: [],
          standards: [],
          categoryId: undefined as unknown as string,
          price: "",
          currency: "USD",
        },
  });
  const kind = form.watch("kind");
  const watchedPrice = form.watch("price");
  const watchedCurrency = form.watch("currency") || "USD";
  const watchedUnit = form.watch("unit") || "unit";

  // Build unified FX pairs: API rates merged with fallback defaults
  const activePairs: FxPair[] = [
    ...rates
      .map((r) => ({
        base: r.base,
        quote: r.quote,
        rate: typeof r.rate === "string" ? Number.parseFloat(r.rate) : r.rate,
      }))
      .filter((r) => Number.isFinite(r.rate) && r.rate > 0),
    ...FALLBACK_RATES,
  ].filter((p, idx, arr) => arr.findIndex((x) => x.base === p.base && x.quote === p.quote) === idx);

  const numericPrice = Number.parseFloat(watchedPrice);
  const isValidPrice = Number.isFinite(numericPrice) && numericPrice > 0;

  // Rate to UGX
  const rateToUgx = fxRate(activePairs, watchedCurrency, "UGX");
  const ugxAmount = isValidPrice
    ? convertAmount(activePairs, numericPrice, watchedCurrency, "UGX")
    : null;
  const ugxFormatted = ugxAmount !== null ? fmtMoney(ugxAmount, "UGX") : null;
  const rateFormatted = rateToUgx !== null ? fmtNumber(rateToUgx) : null;

  // Other currencies for preview (KES, TZS, EUR, GBP)
  const previewQuotes = ["KES", "TZS", "EUR", "GBP"].filter((q) => q !== watchedCurrency);
  const otherConversions = isValidPrice
    ? previewQuotes
        .map((quote) => {
          const converted = convertAmount(activePairs, numericPrice, watchedCurrency, quote);
          return converted !== null ? { quote, amount: fmtMoney(converted, quote) } : null;
        })
        .filter((c): c is { quote: string; amount: string } => c !== null)
    : [];

  async function onSubmit(values: ListingCreate) {
    try {
      if (existing) {
        const { kind: _kind, ...update } = values;
        await api.patch(`/catalogue/${existing.id}`, update);
        toast.success("Listing updated");
      } else {
        const created = await api.post<{ id: string }>("/catalogue", values);
        toast.success("Listing saved as draft — publish it when ready");
        router.push(`/catalogue/${created.id}`);
      }
      router.refresh();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <Card>
      <CardContent className="pt-2">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="kind"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Kind</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={!!existing}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {LISTING_KINDS.map((k) => (
                          <SelectItem key={k} value={k}>
                            {LISTING_KIND_LABELS[k]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Category</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categories.map((c) => (
                          <SelectItem key={c.id} value={c.id}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Chemical / product name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Paracetamol BP/EP (API)" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="casNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CAS number</FormLabel>
                    <FormControl>
                      <Input placeholder="103-90-2" {...field} value={field.value ?? ""} />
                    </FormControl>
                    {kind === "RAW_MATERIAL" ? (
                      <FormDescription>
                        Required to publish a raw material listing — you can save a draft without
                        it.
                      </FormDescription>
                    ) : null}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="ghsClassification"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>GHS hazard classification</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g. GHS07 — Irritant"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormDescription>Hazard-classified materials need an SDS.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="countryOfOrigin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Country of origin</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="packagingType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Packaging type</FormLabel>
                    <FormControl>
                      <Input placeholder="Fibre drum" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="packSize"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pack size</FormLabel>
                    <FormControl>
                      <Input placeholder="25 kg" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-4">
              <FormField
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Price / unit</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" placeholder="12.50" {...field} />
                    </FormControl>
                    {isValidPrice && ugxFormatted ? (
                      <FormDescription className="text-xs font-medium text-primary">
                        Equivalent in UGX: {ugxFormatted}
                      </FormDescription>
                    ) : rateFormatted ? (
                      <FormDescription className="text-xs text-muted-foreground">
                        Configured rate: 1 {watchedCurrency} = {rateFormatted} UGX
                      </FormDescription>
                    ) : null}
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Currency</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CURRENCIES.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="hsCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>HS code</FormLabel>
                    <FormControl>
                      <Input placeholder="293624" {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Real-time currency conversion (US-302):
                Suppliers pricing in USD (or other currencies) can view the equivalent
                in UGX using the configured exchange rate in real time. */}
            <div
              className="rounded-lg border border-border/80 bg-muted/30 p-3.5 text-sm transition-all"
              data-testid="price-conversion-panel"
              aria-live="polite"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 pb-2">
                <div className="flex items-center gap-1.5 font-medium text-xs text-muted-foreground">
                  <ArrowRightLeft className="size-3.5 text-primary" />
                  <span>Currency conversion (US-302)</span>
                </div>
                {rateFormatted && (
                  <span
                    className="text-xs text-muted-foreground tabular-nums"
                    data-testid="configured-rate"
                  >
                    Configured rate: 1 {watchedCurrency} = {rateFormatted} UGX
                  </span>
                )}
              </div>

              <div className="mt-2.5 flex flex-wrap items-baseline justify-between gap-3">
                <div>
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Equivalent in UGX:
                  </span>
                  <div className="mt-0.5 flex items-baseline gap-1.5">
                    <span
                      className="text-xl font-bold tabular-nums text-foreground"
                      data-testid="equivalent-in-ugx"
                    >
                      {ugxFormatted ?? "—"}
                    </span>
                    {isValidPrice && (
                      <span className="text-xs text-muted-foreground">/ {watchedUnit}</span>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-xs text-muted-foreground block">Converted value</span>
                  <span
                    className="text-sm font-semibold tabular-nums text-foreground block"
                    data-testid="converted-value"
                  >
                    {ugxFormatted ?? (isValidPrice ? "—" : `Enter price in ${watchedCurrency}`)}
                  </span>
                </div>
              </div>

              {!isValidPrice && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Enter price in {watchedCurrency} to view equivalent in UGX using configured rate
                  {rateFormatted ? ` (1 ${watchedCurrency} = ${rateFormatted} UGX)` : ""}.
                </p>
              )}

              {isValidPrice && otherConversions.length > 0 && (
                <div className="mt-2.5 pt-2 border-t border-border/40 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="font-medium">Other configured rates:</span>
                  {otherConversions.map(({ quote, amount }) => (
                    <span
                      key={quote}
                      className="inline-flex items-center rounded-md bg-background px-2 py-0.5 text-xs font-medium border border-border/60 tabular-nums"
                    >
                      ≈ {amount}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="shelfLifeMonths"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Shelf life (months)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        max={240}
                        {...field}
                        value={typeof field.value === "number" ? field.value : ""}
                        onChange={(e) =>
                          field.onChange(e.target.value === "" ? undefined : Number(e.target.value))
                        }
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="storageConditions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Storage conditions</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Store below 25°C in a dry place"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            {/* Phase 4 §4: pharmacopoeia conformity — enforced with a quality
                document at publish time */}
            <FormField
              control={form.control}
              name="standards"
              render={({ field }) => (
                <FormItem>
                  <fieldset className="grid gap-2">
                    <legend className="mb-2 text-sm font-medium leading-none">
                      Pharmacopoeia standards
                    </legend>
                    <div className="flex flex-wrap gap-3">
                      {PHARMACOPOEIA_STANDARDS.map((standard) => {
                        const selected = (field.value ?? []).includes(standard);
                        return (
                          <label
                            key={standard}
                            className="flex cursor-pointer items-center gap-1.5 text-sm"
                          >
                            <input
                              type="checkbox"
                              className="size-4 accent-[var(--color-primary)]"
                              checked={selected}
                              onChange={(e) =>
                                field.onChange(
                                  e.target.checked
                                    ? [...(field.value ?? []), standard]
                                    : (field.value ?? []).filter((s: string) => s !== standard),
                                )
                              }
                            />
                            {standard}
                          </label>
                        );
                      })}
                    </div>
                    <FormMessage />
                  </fieldset>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="certifications"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Certifications</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="BP, EP, WHO-GMP (comma-separated)"
                      value={(field.value ?? []).join(", ")}
                      onChange={(e) =>
                        field.onChange(
                          e.target.value
                            .split(",")
                            .map((c) => c.trim())
                            .filter(Boolean),
                        )
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting
                ? "Saving…"
                : existing
                  ? "Save changes"
                  : "Create listing (draft)"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
