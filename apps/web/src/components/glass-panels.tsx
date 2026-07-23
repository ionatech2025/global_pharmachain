import { cn } from "@pharmachain/ui/lib/utils";
import { FileCheck2, ScrollText, ShieldCheck, Thermometer, TrendingUp } from "lucide-react";

/**
 * Frosted vignette cards for the marketing and auth sky panels. Everything
 * here is decorative illustration (aria-hidden at the use site, same
 * precedent as RouteMarquee): the floating cards are product-UI vignettes
 * with illustrative data, not live metrics. Pure server-rendered SVG/CSS —
 * no client JS; all motion obeys the global reduced-motion switch.
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

/**
 * Olympus-style floating market cards for the sky hero (≥lg): a price-index
 * ticker, the verified-network card, an on-time lane card and a cold-chain
 * chip, staggered over the panel with a gentle float.
 */
export function HeroMarketCards({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none relative", className)}>
      {/* Price-index ticker */}
      <div className="glass-card animate-float absolute top-0 right-0 w-56 rounded-2xl p-4">
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-[11px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            Para-API · USD/kg
          </span>
          <span className="text-xs font-semibold text-success tabular-nums">+0.6%</span>
        </div>
        <div className="mt-1 flex items-end justify-between gap-3">
          <p className="text-2xl font-semibold tracking-tight tabular-nums">$4.82</p>
          <Sparkline className="text-success" />
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">Marketplace median · 30 days</p>
      </div>

      {/* Verified-network card */}
      <div
        className="glass-card animate-float absolute top-[9.5rem] left-0 rounded-2xl p-4"
        style={{ animationDelay: "1.2s" }}
      >
        <p className="text-2xl font-semibold tracking-tight tabular-nums">1,240+</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Verified companies worldwide</p>
        <AvatarCluster className="mt-3" />
      </div>

      {/* On-time lane card */}
      <div
        className="glass-card animate-float absolute right-2 bottom-16 w-60 rounded-2xl p-4"
        style={{ animationDelay: "0.6s" }}
      >
        <div className="flex items-baseline justify-between gap-4">
          <span className="text-xs font-medium text-muted-foreground">Mumbai → Kampala</span>
          <TrendingUp className="size-3.5 text-success" />
        </div>
        <div className="mt-1 flex items-end gap-3">
          <p className="text-xl font-semibold tracking-tight tabular-nums">98.4%</p>
          <Sparkline className="text-success" />
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">On-time deliveries · 30 days</p>
      </div>

      {/* Cold-chain chip */}
      <div
        className="glass-card animate-float absolute bottom-2 left-6 flex items-center gap-2 rounded-full px-3.5 py-2"
        style={{ animationDelay: "1.9s" }}
      >
        <Thermometer className="size-4 text-info" />
        <span className="text-xs font-semibold tabular-nums">2–8 °C</span>
        <span className="text-[11px] text-muted-foreground">cold chain held</span>
      </div>
    </div>
  );
}

/** Compact ticker pair shown under the hero copy on small screens. */
export function HeroTickerRow({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("flex flex-wrap items-center gap-3", className)}>
      <div className="glass-card flex items-center gap-3 rounded-2xl px-4 py-3">
        <div>
          <p className="text-lg leading-none font-semibold tracking-tight tabular-nums">1,240+</p>
          <p className="mt-1 text-[11px] text-muted-foreground">Verified companies</p>
        </div>
        <AvatarCluster />
      </div>
      <div className="glass-card flex items-center gap-3 rounded-2xl px-4 py-3">
        <div>
          <p className="text-lg leading-none font-semibold tracking-tight tabular-nums">98.4%</p>
          <p className="mt-1 text-[11px] text-muted-foreground">On-time · 30 days</p>
        </div>
        <Sparkline className="text-success" />
      </div>
    </div>
  );
}

/**
 * Auth right-hand aside, Untitled-UI style: a calm daylight-sky artwork
 * panel with a display tagline and one product-screenshot vignette floating
 * at its centre.
 */
export function AuthBrandPanel() {
  return (
    <aside aria-hidden className="sky-scope relative hidden overflow-hidden bg-panel-sky lg:block">
      <div className="absolute inset-0 bg-panel-grid opacity-60" />
      <div className="relative flex h-full flex-col justify-between gap-10 p-10 xl:p-14">
        <div>
          <p className="eyebrow text-foreground/70">
            <ShieldCheck className="size-3.5" />
            PharmaChain · Global network
          </p>
          <p className="text-display mt-6 max-w-md text-4xl text-balance xl:text-5xl">
            Global pharma trade, verified.
          </p>
          <p className="mt-4 max-w-sm text-sm text-foreground/75">
            Every counterparty is credential-checked before a single quote is exchanged — and every
            step lands on the audit trail.
          </p>
        </div>

        <div className="max-w-sm space-y-4">
          <span className="glass-card inline-flex items-center gap-2 rounded-full px-4 py-2">
            <ShieldCheck className="size-4 text-success" />
            <span className="text-xs font-medium">GMP · GDP verified network</span>
          </span>

          {/* Product-screenshot vignette */}
          <div className="glass-card animate-float rounded-2xl p-5">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-semibold">Order PC-2481</p>
              <span className="rounded-full bg-info/12 px-2.5 py-0.5 text-[11px] font-semibold text-info">
                In transit
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Mumbai → Kampala · Amoxicillin API · 500 kg
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

        <p className="text-xs text-foreground/60">
          Compliant document exchange · Immutable audit trail · GDPR-ready
        </p>
      </div>
    </aside>
  );
}
