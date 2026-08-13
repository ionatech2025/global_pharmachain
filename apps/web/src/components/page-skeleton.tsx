import { Skeleton } from "@pharmachain/ui/components/skeleton";

/**
 * Shared route-level loading state. Mirrors the common page anatomy
 * (header → toolbar → table) so navigation feels instant and nothing
 * jumps when real content streams in.
 */
export function PageSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div role="status" aria-busy="true" aria-label="Loading page" className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-6 w-44" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-9 w-28" />
      </div>
      <div className="space-y-2 pt-2">
        <Skeleton className="h-9 w-full" />
        {Array.from({ length: rows }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder list
          <Skeleton key={i} className="h-11 w-full" style={{ opacity: 1 - i * 0.09 }} />
        ))}
      </div>
    </div>
  );
}

/**
 * Dashboard-shaped skeleton. Mirrors the real anatomy block for block —
 * masthead, tile row, chart beside the pipeline, table beside the attention
 * column — so the layout never jumps when the data lands.
 */
export function DashboardSkeleton() {
  return (
    <div role="status" aria-busy="true" aria-label="Loading dashboard" className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <div className="flex gap-2">
          <Skeleton className="h-8 w-28 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 w-32 rounded-md" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder list
          <Skeleton key={i} className="h-[6.5rem] w-full rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-3 xl:grid-cols-3">
        <Skeleton className="h-80 w-full rounded-2xl xl:col-span-2" />
        <Skeleton className="h-80 w-full rounded-2xl" />
      </div>
      <div className="grid gap-3 xl:grid-cols-3">
        <Skeleton className="h-72 w-full rounded-2xl xl:col-span-2" />
        <Skeleton className="h-72 w-full rounded-2xl" />
      </div>
    </div>
  );
}
