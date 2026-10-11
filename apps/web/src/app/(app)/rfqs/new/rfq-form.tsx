"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  COMPANY_TYPE_LABELS,
  COMPANY_TYPES,
  type RfqCreate,
  type RfqReach,
  rfqCreateSchema,
  rfqReachNotice,
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
import { cn } from "@pharmachain/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { AttachmentPicker } from "@/components/attachment-picker";
import { api } from "@/lib/api/browser";
import { ApiClientError, errorMessage } from "@/lib/api/http";

const DEFAULT_DEADLINE_DAYS = 14;
/** Radix Select cannot hold an empty value, so "any category" needs a token. */
const ANY_CATEGORY = "any";

function defaultDeadline(): string {
  const d = new Date(Date.now() + DEFAULT_DEADLINE_DAYS * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

export function RfqForm({
  categories,
  prefill,
}: {
  categories: Array<{ id: string; name: string }>;
  prefill: { bomItemId?: string; title?: string; categoryId?: string; unit?: string };
}) {
  const router = useRouter();
  // Schema defaults (.default([])) make the form input wider than the parsed
  // output, so useForm needs both generics to line up with zodResolver.
  const form = useForm<z.input<typeof rfqCreateSchema>, unknown, RfqCreate>({
    resolver: zodResolver(rfqCreateSchema),
    defaultValues: {
      title: prefill.title ?? "",
      specifications: "",
      quantity: "",
      unit: prefill.unit ?? "kg",
      targetCompanyType: "RAW_MATERIAL_MANUFACTURER",
      categoryId: prefill.categoryId,
      deadline: new Date(`${defaultDeadline()}T23:59:00Z`).toISOString(),
      attachmentDocumentIds: [],
      bomItemId: prefill.bomItemId,
    },
  });

  // A category is a targeting choice: only suppliers listing it see the RFQ.
  // The buyer sees what each choice reaches before publishing, not after.
  const targetCompanyType = form.watch("targetCompanyType");
  const categoryId = form.watch("categoryId");
  const { data: reach } = useQuery({
    queryKey: ["rfq-reach", targetCompanyType, categoryId ?? null],
    queryFn: () =>
      api.get<RfqReach>(
        `/rfqs/reach?${new URLSearchParams({
          targetCompanyType,
          ...(categoryId ? { categoryId } : {}),
        })}`,
      ),
    staleTime: 60_000,
  });
  const notice = reach
    ? rfqReachNotice(reach, categories.find((c) => c.id === categoryId)?.name)
    : null;

  async function onSubmit(values: RfqCreate) {
    try {
      const rfq = await api.post<{ id: string; refNo: string; visibleSupplierCount: number }>(
        "/rfqs",
        values,
      );
      toast.success(`${rfq.refNo} published — visible to ${rfq.visibleSupplierCount} supplier(s)`);
      router.push(`/rfqs/${rfq.id}`);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "LIMIT_REACHED") {
        const d = (err.details ?? {}) as { used?: number; limit?: number };
        toast.error(err.message, {
          description:
            d.used !== undefined && d.limit !== undefined
              ? `${d.used} of ${d.limit} used this month. Buy credits for this month or upgrade your plan.`
              : "Buy credits for this month or upgrade your plan.",
          duration: 10000,
          action: { label: "Get credits", onClick: () => router.push("/company/usage") },
          cancel: { label: "Upgrade", onClick: () => router.push("/company/usage") },
        });
        return;
      }
      toast.error(errorMessage(err));
    }
  }

  return (
    <Card>
      <CardContent className="pt-2">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Product / material required</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Paracetamol BP (API)" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" placeholder="500" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unit</FormLabel>
                    <FormControl>
                      <Input placeholder="kg" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="targetCompanyType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Target supplier category</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {COMPANY_TYPES.map((t) => (
                        <SelectItem key={t} value={t}>
                          {COMPANY_TYPE_LABELS[t]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Only verified companies of this type will see the RFQ.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="categoryId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Material category (optional)</FormLabel>
                  <Select
                    onValueChange={(v) => field.onChange(v === ANY_CATEGORY ? undefined : v)}
                    value={field.value ?? ANY_CATEGORY}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {/* Explicit, so a category picked by mistake can be undone. */}
                      <SelectItem value={ANY_CATEGORY}>Any category</SelectItem>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {notice && (
                    <FormDescription
                      aria-live="polite"
                      className={cn(
                        "flex items-start gap-1.5",
                        notice.tone === "warning" && "font-medium text-warning",
                        notice.tone === "narrowed" && "text-foreground",
                      )}
                    >
                      {notice.tone === "warning" && (
                        <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                      )}
                      <span>{notice.text}</span>
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="specifications"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Required specifications</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={4}
                      placeholder="Grade, pharmacopoeia (BP/USP/EP), purity, user requirement specifications (URS) or drawings, documentation required…"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="deadline"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Response deadline</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      min={new Date().toISOString().slice(0, 10)}
                      defaultValue={field.value?.slice(0, 10)}
                      onChange={(e) =>
                        field.onChange(new Date(`${e.target.value}T23:59:00Z`).toISOString())
                      }
                    />
                  </FormControl>
                  <FormDescription>Past deadlines are rejected.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="attachmentDocumentIds"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Attachments (optional)</FormLabel>
                  <FormControl>
                    <AttachmentPicker
                      kind="RFQ_ATTACHMENT"
                      value={field.value ?? []}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormDescription>
                    User requirement specifications (URS), spec sheets or drawings — eligible
                    suppliers can download these.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? "Publishing…" : "Publish RFQ"}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
