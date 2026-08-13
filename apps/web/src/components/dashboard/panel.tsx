import { cn } from "@pharmachain/ui/lib/utils";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/**
 * The one analytical surface in the app. Every dashboard, finance and
 * intelligence card is a Panel, so the whole product reads as one system:
 * card surface, hairline border, soft elevation, 16px radius, 20px gutter.
 *
 * Panel is deliberately not the generic Card — Card stays the utility
 * container for forms and detail pages; Panel is the data surface, with the
 * header/body/footer rhythm charts and tables need.
 */
export function Panel({ className, ...props }: ComponentProps<"section">) {
  // min-w-0 is load-bearing, not cosmetic: a grid/flex item defaults to
  // min-width:auto, so a wide table inside would push the panel past its track
  // and scroll the whole page sideways on a phone instead of scrolling itself.
  return <section className={cn("panel flex min-w-0 flex-col", className)} {...props} />;
}

export function PanelHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Right-hand slot: a filter, a link, an export button. */
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-4", className)}
    >
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {description && (
          <p className="mt-1 max-w-prose text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

export function PanelBody({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("min-w-0 flex-1 px-5 pb-5", className)} {...props} />;
}

/** Footer rule + link, for "see all N" affordances under a truncated list. */
export function PanelFooter({ href, children }: { href: string; children: ReactNode }) {
  return (
    <div className="mt-auto border-t px-5 py-2">
      {/* min-h-8 keeps the tap target past the 24px floor (WCAG 2.5.8) — a
          14px line of text is a miss on a phone. */}
      <Link
        href={href}
        className="touch-target min-h-8 text-xs font-medium text-primary transition-opacity hover:opacity-80"
      >
        {children} <span aria-hidden="true">&nbsp;→</span>
      </Link>
    </div>
  );
}

/**
 * A quiet inline caption for the "where this number came from" line — the
 * habit that keeps an analytics screen trustworthy rather than decorative.
 */
export function Provenance({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">{children}</p>;
}
