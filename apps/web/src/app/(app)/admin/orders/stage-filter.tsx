"use client";

import { ORDER_STATUS_LABELS, ORDER_STATUSES } from "@pharmachain/core";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

/** Exact-stage filter that applies as soon as a stage is picked — no separate
 *  button to press (client review 2026-11-06: filters that wait for a button
 *  read as broken). Keeps the search box's `q`; resets to page 1. */
export function StageFilter({ value }: { value: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="order-stage" className="text-muted-foreground">
        Stage
      </label>
      <select
        id="order-stage"
        value={value}
        aria-busy={pending}
        onChange={(e) => {
          const next = new URLSearchParams(searchParams.toString());
          next.delete("page");
          if (e.target.value) next.set("status", e.target.value);
          else next.delete("status");
          const qs = next.toString();
          startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname));
        }}
        className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25"
      >
        <option value="">Any stage</option>
        {ORDER_STATUSES.map((s, i) => (
          <option key={s} value={s}>
            {i + 1}. {ORDER_STATUS_LABELS[s]}
          </option>
        ))}
      </select>
    </div>
  );
}
