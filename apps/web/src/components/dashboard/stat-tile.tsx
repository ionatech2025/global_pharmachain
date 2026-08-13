import { cn } from "@pharmachain/ui/lib/utils";
import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import Link from "next/link";
import { Children, type ComponentType, type ReactNode } from "react";
import { Sparkline } from "./charts";

export interface DeltaInput {
  current: number;
  previous: number;
}

/**
 * Period-over-period change. Direction is not the same as good news — customs
 * dwell going up is bad — so the caller declares which way is good and the
 * colour follows that, never the sign. The arrow is the non-colour channel, so
 * the pill still reads under any colour vision.
 */
export function TrendPill({
  delta,
  goodDirection = "up",
  className,
}: {
  delta: DeltaInput;
  goodDirection?: "up" | "down" | "neutral";
  className?: string;
}) {
  const { current, previous } = delta;
  // Nothing either side of the boundary: there is no change to report, and a
  // "0%" would imply a measurement that never happened.
  if (current === 0 && previous === 0) return null;

  const base =
    "inline-flex w-fit shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold";
  if (previous === 0) {
    return (
      <span className={cn(base, "bg-success/12 text-success", className)}>
        <ArrowUp className="size-3" aria-hidden="true" />
        new
      </span>
    );
  }

  const changePct = ((current - previous) / previous) * 100;
  const rounded = Math.abs(changePct) >= 10 ? Math.round(changePct) : Number(changePct.toFixed(1));
  const Icon = rounded > 0 ? ArrowUp : rounded < 0 ? ArrowDown : ArrowRight;
  const good = goodDirection === "up" ? rounded > 0 : goodDirection === "down" ? rounded < 0 : null;
  const tone =
    rounded === 0 || good === null
      ? "bg-muted text-muted-foreground"
      : good
        ? "bg-success/12 text-success"
        : "bg-destructive/12 text-destructive";

  return (
    <span className={cn(base, tone, className)}>
      <Icon className="size-3" aria-hidden="true" />
      {rounded > 0 ? "+" : ""}
      {rounded}%
    </span>
  );
}

export interface StatTileProps {
  label: string;
  value: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  href?: string;
  /** Trailing window vs the one before it. */
  delta?: DeltaInput;
  goodDirection?: "up" | "down" | "neutral";
  /** The "where this came from" line — period, sample size, definition. */
  caption?: string;
  /** Real history behind the figure. Omitted when there is nothing to plot. */
  spark?: number[];
  /** Status tint on the icon chip. Reserved for genuine state, not decoration. */
  tone?: "default" | "warning" | "danger";
}

/**
 * The dashboard's unit of measurement: chip + label, the figure, then the
 * change and its provenance. The figure uses proportional digits — tabular
 * figures are for columns that must align, and make a standalone number look
 * gappy at display size.
 */
export function StatTile({
  label,
  value,
  icon: Icon,
  href,
  delta,
  goodDirection = "up",
  caption,
  spark,
  tone = "default",
}: StatTileProps) {
  const chipTone =
    tone === "danger"
      ? "bg-destructive/12 text-destructive"
      : tone === "warning"
        ? "bg-warning/15 text-warning"
        : "";

  const body = (
    <>
      <div className="flex items-center gap-2">
        {Icon && (
          <span className={cn("tile-chip", chipTone)} aria-hidden="true">
            <Icon className="size-3.5" />
          </span>
        )}
        <p className="min-w-0 truncate text-xs font-medium text-muted-foreground">{label}</p>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <p className="figure text-[1.7rem] leading-none">{value}</p>
        {spark?.some((v) => v > 0) && <Sparkline points={spark} />}
      </div>
      {(delta || caption) && (
        <div className="mt-2.5 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1">
          {delta && <TrendPill delta={delta} goodDirection={goodDirection} />}
          {/* Provenance wraps rather than truncates: "23/25 within ETA (+1 day
              grace)" losing its tail is worse than a second line. */}
          {caption && (
            <span className="min-w-0 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
              {caption}
            </span>
          )}
        </div>
      )}
    </>
  );

  const className = "panel p-4";
  return href ? (
    <Link href={href} className={cn(className, "panel-link block")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

/**
 * Even grid of tiles. The desktop column count follows the number of tiles
 * actually rendered, because a role-aware dashboard emits four or five: a
 * fixed four-column grid leaves the fifth tile stranded alone on a second row.
 * Children.toArray drops the `false` slots that conditional tiles leave behind,
 * so the count is of real tiles, not JSX expressions.
 */
export function StatGrid({ children, className }: { children: ReactNode; className?: string }) {
  const count = Children.toArray(children).length;
  const cols =
    count === 5
      ? "xl:grid-cols-5"
      : count === 3
        ? "xl:grid-cols-3"
        : count <= 2
          ? "sm:grid-cols-2"
          : "xl:grid-cols-4";
  return <div className={cn("grid gap-3 sm:grid-cols-2", cols, className)}>{children}</div>;
}
