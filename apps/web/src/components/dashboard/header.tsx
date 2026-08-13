import { cn } from "@pharmachain/ui/lib/utils";
import Link from "next/link";
import type { ComponentType, ReactNode } from "react";

/** Time of day in the viewer's own timezone, not the server's. */
function greeting(timeZone?: string | null): string {
  const hour =
    Number(
      new Intl.DateTimeFormat("en-GB", {
        hour: "numeric",
        hour12: false,
        timeZone: timeZone ?? undefined,
      }).format(new Date()),
    ) % 24;
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

/**
 * Dashboard masthead. A dashboard is somewhere you land, not a document you
 * read, so it opens by addressing the person and stating what they are looking
 * at — who they're acting for, and over what window — before any number.
 */
export function DashboardHeader({
  name,
  subtitle,
  timeZone,
  scopeNote,
  children,
}: {
  name: string;
  /** Who this data belongs to — company, role, or platform scope. */
  subtitle: ReactNode;
  timeZone?: string | null;
  /** The window every figure on the page is measured over. */
  scopeNote?: string;
  /** Actions: customise, refresh, the primary call to action. */
  children?: ReactNode;
}) {
  const firstName = name.trim().split(/\s+/)[0] ?? name;
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-balance sm:text-2xl">
          {greeting(timeZone)}, {firstName}
        </h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
          {subtitle}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {scopeNote && (
          <span className="hidden items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-xs text-muted-foreground sm:inline-flex">
            {/* A live dot that never pulses — the data is fresh, not busy. */}
            <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
            {scopeNote}
          </span>
        )}
        {children}
      </div>
    </div>
  );
}

/**
 * The handful of things a user comes to the dashboard to start. Kept as
 * bordered tiles rather than a row of buttons so they read as destinations,
 * matching the panels around them.
 */
export function QuickActions({
  actions,
  className,
}: {
  actions: Array<{
    href: string;
    label: string;
    hint: string;
    icon: ComponentType<{ className?: string }>;
  }>;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 xl:grid-cols-4", className)}>
      {actions.map(({ href, label, hint, icon: Icon }) => (
        <Link key={href} href={href} className="panel panel-link flex items-center gap-3 p-4">
          <span className="tile-chip size-9 rounded-xl" aria-hidden="true">
            <Icon className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{label}</span>
            <span className="block truncate text-xs text-muted-foreground">{hint}</span>
          </span>
        </Link>
      ))}
    </div>
  );
}
