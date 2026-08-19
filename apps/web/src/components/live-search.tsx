"use client";

import { Input } from "@pharmachain/ui/components/input";
import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, useTransition } from "react";

/**
 * Type-to-filter search box for server-rendered list pages.
 *
 * QA finding: the plain GET form needed Enter to search and gave no way back —
 * emptying the box left the previous results on screen. Here the query param
 * follows what is typed (debounced), and clearing it restores the full list,
 * because an empty value removes the param entirely rather than sending "".
 *
 * router.replace keeps one history entry per search session, so Back leaves
 * the page instead of replaying every keystroke.
 */
interface LiveSearchProps {
  /** Query-string key this field owns. */
  paramName?: string;
  placeholder?: string;
  /** Accessible name for the field. */
  label: string;
  className?: string;
  debounceMs?: number;
}

/**
 * useSearchParams opts a subtree out of static prerendering, so the boundary
 * lives here rather than at every call site.
 */
export function LiveSearch(props: LiveSearchProps) {
  return (
    <Suspense
      fallback={
        <Input type="search" aria-label={props.label} disabled className={props.className} />
      }
    >
      <LiveSearchField {...props} />
    </Suspense>
  );
}

function LiveSearchField({
  paramName = "q",
  placeholder = "Search…",
  label,
  className,
  debounceMs = 300,
}: LiveSearchProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlValue = searchParams.get(paramName) ?? "";
  const [value, setValue] = useState(urlValue);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep in step when the URL changes from elsewhere (a filter chip, Back).
  useEffect(() => {
    setValue(urlValue);
  }, [urlValue]);

  useEffect(() => {
    if (value === urlValue) return;
    const timer = setTimeout(() => {
      const next = new URLSearchParams(searchParams.toString());
      if (value) next.set(paramName, value);
      else next.delete(paramName);
      // A new search always starts at page 1 — otherwise a narrower result set
      // lands on a page that no longer exists and looks empty.
      next.delete("page");
      const qs = next.toString();
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname));
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [value, urlValue, paramName, debounceMs, pathname, router, searchParams]);

  return (
    <div className={`relative ${className ?? ""}`}>
      <Search
        className="pointer-events-none absolute inset-y-0 left-3 my-auto size-4 text-muted-foreground"
        aria-hidden
      />
      <Input
        ref={inputRef}
        type="search"
        aria-label={label}
        aria-busy={isPending}
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        // Native search inputs paint their own clear affordance in WebKit;
        // ours is themed and works everywhere, so the built-in one goes.
        className="pl-9 pr-9 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            setValue("");
            inputRef.current?.focus();
          }}
          aria-label="Clear search"
          className="absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
