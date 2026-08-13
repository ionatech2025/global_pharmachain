import { cn } from "@pharmachain/ui/lib/utils";
import { CheckCircle2, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";

export interface AttentionItem {
  key: string;
  icon: ComponentType<{ className?: string }>;
  /** Severity, not decoration — it decides the chip colour and the reading order. */
  tone: "info" | "warning" | "danger";
  title: string;
  detail: string;
  href?: string;
}

const TONES: Record<AttentionItem["tone"], string> = {
  info: "bg-info/12 text-info",
  warning: "bg-warning/15 text-warning",
  danger: "bg-destructive/12 text-destructive",
};

/**
 * The "what needs me" column. Only genuine exceptions get a row: an empty list
 * is a good outcome and says so, rather than being padded out with items that
 * need nothing. Severity rides an icon and a label as well as colour.
 */
export function AttentionList({
  items,
  emptyNote = "Nothing needs your attention right now.",
}: {
  items: AttentionItem[];
  emptyNote?: string;
}) {
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-success/8 px-3.5 py-3">
        <CheckCircle2 className="size-4 shrink-0 text-success" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">{emptyNote}</p>
      </div>
    );
  }
  return (
    <ul className="space-y-1.5">
      {items.map(({ key, icon: Icon, tone, title, detail, href }) => {
        const row = (
          <>
            <span className={cn("tile-chip", TONES[tone])} aria-hidden="true">
              <Icon className="size-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{title}</span>
              <span className="line-clamp-2 block text-xs leading-snug text-muted-foreground">
                {detail}
              </span>
            </span>
            {href && (
              <ChevronRight
                className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
            )}
          </>
        );
        return (
          <li key={key}>
            {href ? (
              <Link
                href={href}
                className="touch-target group -mx-1.5 flex w-[calc(100%+0.75rem)] gap-3 rounded-lg px-1.5 py-2 transition-colors hover:bg-accent"
              >
                {row}
              </Link>
            ) : (
              <div className="-mx-1.5 flex items-center gap-3 px-1.5 py-2">{row}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
