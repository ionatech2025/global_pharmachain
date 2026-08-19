import { ArrowLeft } from "lucide-react";
import Link from "next/link";

export function PageHeader({
  eyebrow,
  title,
  description,
  backHref,
  backLabel,
  children,
}: {
  /** Uppercase micro-label above the title — the marketing eyebrow, in-app. */
  eyebrow?: string;
  title: string;
  description?: string;
  /**
   * Where "back" goes from a detail page. A real link to a known parent, not
   * history.back(): a detail page is routinely opened from a notification, a
   * search result or a pasted URL, and history.back() from there leaves the
   * app entirely. The link always lands on the list this record belongs to.
   */
  backHref?: string;
  /** Name of the destination, e.g. "My RFQs". Defaults to a plain "Back". */
  backLabel?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      {backHref && (
        <Link
          href={backHref}
          className="touch-target -ml-1 inline-flex w-fit items-center gap-1.5 rounded-md px-1 py-0.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4 shrink-0" aria-hidden />
          {backLabel ? `Back to ${backLabel}` : "Back"}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {eyebrow && <span className="eyebrow">{eyebrow}</span>}
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
          {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
        </div>
        {children && <div className="flex items-center gap-2">{children}</div>}
      </div>
    </div>
  );
}
