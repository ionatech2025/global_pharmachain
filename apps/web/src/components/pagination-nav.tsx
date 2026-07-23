import { Button } from "@pharmachain/ui/components/button";
import Link from "next/link";

interface PaginationNavProps {
  page: number;
  totalPages: number;
  total: number;
  /** Pluralized noun for the summary line, e.g. "listing(s)". */
  noun: string;
  /** Path the page links point at, e.g. "/marketplace". */
  basePath: string;
  /** Query params to preserve across page changes (page is added on top). */
  params?: Record<string, string | undefined>;
}

/**
 * The one pagination pattern for every list page: count summary on the left,
 * Previous/Next on the right, other query params preserved. Serializable
 * props only, so it renders from server and client components alike.
 */
export function PaginationNav({
  page,
  totalPages,
  total,
  noun,
  basePath,
  params = {},
}: PaginationNavProps) {
  const hrefFor = (target: number) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value) search.set(key, value);
    }
    search.set("page", String(target));
    return `${basePath}?${search.toString()}`;
  };
  return (
    <div className="flex items-center justify-between">
      <p className="text-xs text-muted-foreground">
        Page {page} of {Math.max(totalPages, 1)} · {total} {noun}
      </p>
      <div className="flex gap-2">
        {page > 1 && (
          <Button asChild variant="outline" size="sm">
            <Link href={hrefFor(page - 1)}>Previous</Link>
          </Button>
        )}
        {page < totalPages && (
          <Button asChild variant="outline" size="sm">
            <Link href={hrefFor(page + 1)}>Next</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
