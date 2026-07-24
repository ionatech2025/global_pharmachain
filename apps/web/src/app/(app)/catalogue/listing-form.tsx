"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  CURRENCIES,
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
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { api } from "@/lib/api/browser";
import { errorMessage } from "@/lib/api/http";
import type { ListingRow } from "@/lib/api/types";

export function ListingForm({
  categories,
  existing,
}: {
  categories: Array<{ id: string; name: string }>;
  existing?: ListingRow;
}) {
  const router = useRouter();
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
                    <FormLabel>CAS number{kind === "RAW_MATERIAL" ? " *" : ""}</FormLabel>
                    <FormControl>
                      <Input placeholder="103-90-2" {...field} value={field.value ?? ""} />
                    </FormControl>
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
                    <FormDescription>
                      Hazard-classified materials need an SDS (US-303).
                    </FormDescription>
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
                  <FormLabel>Pharmacopoeia standards</FormLabel>
                  <FormControl>
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
                  </FormControl>
                  <FormMessage />
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
