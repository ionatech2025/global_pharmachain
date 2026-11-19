import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Factory,
  FlaskConical,
  Landmark,
  ScrollText,
  ShieldCheck,
  Ticket,
} from "lucide-react";
import Link from "next/link";
import { HeroMarketCards, HeroTickerRow } from "@/components/glass-panels";
import { GlobeMotionToggle, HeroGlobe } from "@/components/hero-globe";
import { RouteMarquee } from "@/components/route-marquee";
import { LANE_LINKS } from "@/lib/lane-links";

/** The three lane entry points; the Mall Directory and footer repeat the same hrefs. */
const HERO_ACTIONS = [
  {
    href: LANE_LINKS.source,
    lane: "Upstream",
    icon: FlaskConical,
    tone: "text-sky-700 dark:text-sky-300",
    label: "Source Raw Materials & Consumables",
    audience: "For Manufacturers buying inputs",
  },
  {
    href: LANE_LINKS.list,
    lane: "Midstream",
    icon: Factory,
    tone: "text-indigo-700 dark:text-indigo-300",
    label: "List Finished Formulations / Capacity",
    audience: "For Manufacturers selling products or contract services",
  },
  {
    href: LANE_LINKS.procure,
    lane: "Downstream",
    icon: Building2,
    tone: "text-teal-700 dark:text-teal-300",
    label: "Procure Bulk Finished Medications",
    audience: "For Wholesale Traders, Distributors & Institutional Buyers",
  },
] as const;

const TRUST_CHIPS = [
  {
    icon: ShieldCheck,
    tone: "text-teal-600 dark:text-teal-400",
    label: "Cryptographic Escrow Verification",
  },
  { icon: ScrollText, tone: "text-sky-600 dark:text-sky-400", label: "Secure Audit Ledger" },
  {
    icon: Landmark,
    tone: "text-amber-600 dark:text-amber-400",
    label: "Bank Wire, Corporate Accounts & LC",
  },
];

function TradingPass() {
  return (
    <div className="landing-card mt-8 p-3 text-left sm:p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-1">
        <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/12 px-2 py-0.5 text-[11px] font-semibold tracking-[0.14em] text-amber-800 uppercase dark:text-amber-300">
          <Ticket aria-hidden className="size-3.5" />
          Trading pass
        </span>
        <span className="text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
          3 lanes · Verify · Trade · Track
        </span>
      </div>
      <div className="mt-3 grid items-stretch gap-2.5 sm:grid-cols-3">
        {HERO_ACTIONS.map(({ href, lane, icon: Icon, tone, label, audience }) => (
          <Link
            key={href}
            href={href}
            className="panel-link group flex flex-col gap-1.5 rounded-xl border border-border/70 bg-muted/60 p-3.5 hover:bg-card"
          >
            <span
              className={`flex items-center gap-1.5 text-[11px] font-semibold tracking-[0.12em] uppercase ${tone}`}
            >
              <Icon aria-hidden className="size-3.5 shrink-0" />
              {lane}
              <ArrowRight
                aria-hidden
                className="ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
              />
            </span>
            <span className="text-sm leading-snug font-semibold text-balance text-foreground">
              {label}
            </span>
            <span className="text-xs leading-snug text-muted-foreground">{audience}</span>
          </Link>
        ))}
      </div>
      <p className="mt-3 flex items-center gap-1.5 px-1 text-xs text-muted-foreground">
        <BadgeCheck aria-hidden className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
        Credentials are validated before any deal.
      </p>
    </div>
  );
}

export function LandingHero({ verifiedCompanies }: { verifiedCompanies: number | null }) {
  const network =
    verifiedCompanies && verifiedCompanies > 0
      ? `${verifiedCompanies.toLocaleString("en")} verified compan${verifiedCompanies === 1 ? "y" : "ies"}`
      : "Global B2B Pharmaceutical Network";

  return (
    <section aria-labelledby="hero-title" className="hero-glass relative">
      <div className="mx-auto grid w-full max-w-7xl gap-12 px-4 pt-12 pb-10 sm:px-6 sm:pt-16 lg:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)] lg:items-center lg:gap-8 lg:px-8 lg:pt-16 lg:pb-14">
        <div className="text-center lg:text-left">
          <span className="landing-pill">
            <span aria-hidden className="size-1.5 rounded-full bg-success" />
            {network}
          </span>
          <h1
            id="hero-title"
            className="text-display text-display-hero mt-6 text-balance text-foreground"
          >
            The Unified <span className="whitespace-nowrap">End-to-End</span>{" "}
            <span className="text-gradient-hero">B2B Pharma Ecosystem</span> for Pharmaceutical
            Procurement
          </h1>
          <p className="mx-auto mt-6 max-w-[60ch] text-base leading-[1.65] text-foreground/80 sm:text-lg lg:mx-0">
            Interlinking Manufacturers of Raw Materials and supplier verification across{" "}
            <strong className="font-semibold text-foreground">Upstream Inputs</strong>,{" "}
            <strong className="font-semibold text-foreground">
              Midstream Manufacturing Assets
            </strong>
            , and{" "}
            <strong className="font-semibold text-foreground">
              Downstream Wholesale Distribution
            </strong>
            .
          </p>

          <TradingPass />

          <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-foreground/75 sm:text-[13px] lg:justify-start">
            {TRUST_CHIPS.map(({ icon: Icon, tone, label }) => (
              <li key={label} className="flex items-center gap-1.5">
                <Icon aria-hidden className={`size-4 shrink-0 ${tone}`} />
                {label}
              </li>
            ))}
          </ul>

          <HeroTickerRow
            className="mt-8 justify-center lg:hidden"
            verifiedCompanies={verifiedCompanies}
          />
        </div>

        <div className="relative hidden lg:block">
          <div className="relative mx-auto aspect-square w-full max-w-[34rem]">
            <div aria-hidden className="hero-globe-glow absolute inset-0 rounded-full" />
            <HeroGlobe aurora={false} className="absolute inset-0" />
            <HeroMarketCards className="absolute inset-0" verifiedCompanies={verifiedCompanies} />
          </div>
          {/* Pause for the globe's motion (WCAG 2.2.2): outside its aria-hidden
              layer, and only where the globe shows and moves. */}
          <GlobeMotionToggle className="absolute right-0 bottom-0 hidden lg:motion-safe:inline-flex" />
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
        <RouteMarquee />
      </div>
    </section>
  );
}
