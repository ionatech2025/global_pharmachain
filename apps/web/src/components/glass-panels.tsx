import { cn } from "@pharmachain/ui/lib/utils";
import { FileCheck2, ScrollText, ShieldCheck, Thermometer } from "lucide-react";
import { HeroGlobe } from "./hero-globe";

/**
 * Brand-fixed azure panels + frosted vignette cards for the marketing and
 * auth surfaces. Everything here is decorative illustration (aria-hidden,
 * same precedent as RouteMarquee): the floating cards are product-UI
 * vignettes with illustrative data, not live metrics. Pure server-rendered
 * SVG/CSS — no client JS; all motion obeys the global reduced-motion switch.
 */

/** Tiny up-trending sparkline; inherits colour via currentColor. */
function Sparkline({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 72 24" className={cn("h-6 w-[4.5rem]", className)} role="presentation">
      <polyline
        points="2,19 12,15 22,16.5 32,11 42,13 52,7.5 62,9.5 70,4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="70" cy="4" r="2.4" fill="currentColor" />
    </svg>
  );
}

/* Overlapping-initials cluster (fixed tones — brand-fixed vignette). */
const AVATARS = [
  { initials: "NL", bg: "oklch(0.55 0.13 250)" },
  { initials: "KP", bg: "oklch(0.5 0.11 205)" },
  { initials: "AM", bg: "oklch(0.44 0.14 262)" },
  { initials: "SD", bg: "oklch(0.6 0.1 232)" },
];

function AvatarCluster({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center", className)}>
      {AVATARS.map((a) => (
        <span
          key={a.initials}
          className="-ml-2 flex size-7 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2 ring-white first:ml-0"
          style={{ background: a.bg }}
        >
          {a.initials}
        </span>
      ))}
      <span className="-ml-2 flex size-7 items-center justify-center rounded-full bg-white text-[10px] font-semibold text-primary ring-2 ring-white">
        +9
      </span>
    </div>
  );
}

/** Hero visual: azure gradient panel, wireframe globe, floating glass cards. */
export function HeroPanel({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "panel-globe-scope relative overflow-hidden rounded-[2rem] bg-panel-azure",
        "shadow-[0_32px_80px_-32px_oklch(0.3_0.12_255/0.55)]",
        className,
      )}
    >
      <div className="absolute inset-0 bg-panel-grid" />
      {/* The globe bleeds off the bottom edge for depth */}
      <HeroGlobe className="absolute bottom-[-16%] left-1/2 aspect-square w-[110%] max-w-none -translate-x-1/2" />

      {/* Verified-network stat card */}
      <div className="glass-card animate-float absolute top-5 left-5 rounded-2xl p-4 sm:top-6 sm:left-6">
        <p className="text-2xl font-semibold tracking-tight tabular-nums">1,240+</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Verified companies</p>
        <AvatarCluster className="mt-3" />
      </div>

      {/* Credentials chip */}
      <div
        className="glass-card animate-float absolute top-6 right-5 hidden items-center gap-2 rounded-full px-3.5 py-2 sm:right-6 sm:flex"
        style={{ animationDelay: "1.4s" }}
      >
        <ShieldCheck className="size-4 text-success" />
        <span className="text-xs font-medium">GMP · GDP verified</span>
      </div>

      {/* On-time lane ticker */}
      <div
        className="glass-card animate-float absolute bottom-5 left-5 rounded-2xl p-4 sm:bottom-8 sm:left-6"
        style={{ animationDelay: "0.7s" }}
      >
        <div className="flex items-baseline justify-between gap-6">
          <span className="text-xs font-medium text-muted-foreground">KLA → NBO · API</span>
          <span className="text-xs font-semibold text-success tabular-nums">+0.6%</span>
        </div>
        <div className="mt-1 flex items-end gap-3">
          <p className="text-xl font-semibold tracking-tight tabular-nums">98.4%</p>
          <Sparkline className="text-success" />
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">On-time deliveries · 30 days</p>
      </div>

      {/* Cold-chain chip */}
      <div
        className="glass-card animate-float absolute right-5 bottom-6 hidden rounded-2xl p-3.5 sm:right-6 sm:bottom-10 sm:block"
        style={{ animationDelay: "2.1s" }}
      >
        <div className="flex items-center gap-2">
          <Thermometer className="size-4 text-info" />
          <p className="text-sm font-semibold tabular-nums">2–8 °C</p>
        </div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">Cold chain held</p>
      </div>
    </div>
  );
}

/** Auth right-hand aside: caption + shipment vignette on the azure panel. */
export function AuthBrandPanel() {
  return (
    <aside aria-hidden className="relative hidden overflow-hidden lg:block">
      <div className="absolute inset-0 bg-panel-azure" />
      <div className="absolute inset-0 bg-panel-grid" />
      <div className="relative flex h-full flex-col justify-between gap-10 p-10 xl:p-14">
        <div>
          <p className="eyebrow text-white/70">
            <ShieldCheck className="size-3.5" />
            PharmaChain network
          </p>
          <p className="mt-5 max-w-md text-3xl font-semibold tracking-tight text-balance text-white xl:text-4xl">
            Verified trade, end to end.
          </p>
          <p className="mt-3 max-w-sm text-sm text-white/75">
            Every counterparty is credential-checked before a single quote is exchanged — and every
            step lands on the audit trail.
          </p>
        </div>

        <div className="max-w-sm space-y-4">
          <span className="glass-card inline-flex items-center gap-2 rounded-full px-4 py-2">
            <ShieldCheck className="size-4 text-success" />
            <span className="text-xs font-medium">GMP · GDP verified network</span>
          </span>

          {/* Shipment vignette */}
          <div className="glass-card animate-float rounded-2xl p-5">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-semibold">Order PC-2481</p>
              <span className="rounded-full bg-info/12 px-2.5 py-0.5 text-[11px] font-semibold text-info">
                In transit
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Kampala → Nairobi · Amoxicillin API · 500 kg
            </p>
            <div className="mt-3 flex gap-1">
              {[1, 2, 3, 4].map((s) => (
                <span key={s} className="h-1.5 flex-1 rounded-full bg-primary" />
              ))}
              {[5, 6].map((s) => (
                <span key={s} className="h-1.5 flex-1 rounded-full bg-primary/15" />
              ))}
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Dispatched</span>
              <span className="tabular-nums">ETA Thu · 14:00</span>
            </div>
            <div className="mt-4 flex items-center gap-4 border-t pt-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <FileCheck2 className="size-3.5 text-success" /> CoA v3 shared
              </span>
              <span className="flex items-center gap-1.5">
                <ScrollText className="size-3.5" /> Audit logged
              </span>
            </div>
          </div>
        </div>

        <p className="text-xs text-white/60">
          Compliant document exchange · Immutable audit trail · GDPR-ready
        </p>
      </div>
    </aside>
  );
}
