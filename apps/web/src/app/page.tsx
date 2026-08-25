import { Button } from "@pharmachain/ui/components/button";
import {
  ArrowRight,
  Factory,
  FileText,
  FlaskConical,
  ListChecks,
  Lock,
  MessageSquare,
  Package,
  ScrollText,
  Search,
  ShieldCheck,
  Sparkles,
  Truck,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ChromeCube, ChromeSphere } from "@/components/chrome-motif";
import { HeroMarketCards, HeroTickerRow } from "@/components/glass-panels";
import { HeroGlobe } from "@/components/hero-globe";
import { Logo, LogoMark } from "@/components/logo";
import { ThemeOnlyProviders } from "@/components/providers";
import { RouteMarquee } from "@/components/route-marquee";
import { ThemeToggle } from "@/components/theme-toggle";
import { API_URL } from "@/env";

export const metadata: Metadata = {
  title: { absolute: "PharmaChain — the global verified pharmaceutical marketplace" },
  description:
    "Source pharmaceutical raw materials and finished products from verified companies worldwide. RFQs, quotations, orders, shipment tracking and compliant document exchange — with a full audit trail.",
};

const NAV_LINKS = [
  { href: "#network", label: "Who it's for" },
  { href: "#platform", label: "Platform" },
  { href: "#how", label: "How it works" },
];

const STATS = [
  { value: "13", label: "Forward-only shipment stages, from confirmation to the door" },
  { value: "100%", label: "Of actions recorded on the immutable audit trail" },
  { value: "9", label: "Display currencies across one global marketplace" },
  { value: "0", label: "Email chains or spreadsheets needed per deal" },
];

const AUDIENCES = [
  {
    icon: FlaskConical,
    title: "Raw-material manufacturers",
    body: "Publish APIs and excipients with CoAs, SDS and GMP credentials — visible to verified buyers worldwide.",
  },
  {
    icon: Factory,
    title: "Finished-product manufacturers",
    body: "Source by bill of materials, raise targeted RFQs and compare quotations from any market side by side.",
  },
  {
    icon: Package,
    title: "Suppliers & distributors",
    body: "Quote fast, win orders and keep buyers updated at every stage — from factory gate to the door.",
  },
  {
    icon: Truck,
    title: "Logistics partners",
    body: "Forwarders, clearing agents and transporters run appointed shipments — customs documents, GPS tracking and proof of delivery in one place.",
  },
];

const FEATURES = [
  {
    icon: Search,
    tag: "Marketplace",
    title: "Verified marketplace",
    body: "Search published catalogues from verified companies only — credentials reviewed before anyone can trade.",
  },
  {
    icon: ListChecks,
    tag: "Trade",
    title: "RFQs & quotations",
    body: "Targeted RFQs, versioned quotes with a full history, and side-by-side comparison for the award.",
  },
  {
    icon: Truck,
    tag: "Logistics",
    title: "Shipment tracking",
    body: "Thirteen forward-only stages with GPS checkpoints and proof of delivery; every party is notified on each transition.",
  },
  {
    icon: FileText,
    tag: "Compliance",
    title: "Document vault",
    body: "Versioned compliance documents with expiry alerts and access-controlled sharing per deal.",
  },
  {
    icon: MessageSquare,
    tag: "Messaging",
    title: "Deal messaging",
    body: "Pairwise threads on every RFQ, quotation and order — nothing ever leaks between competing suppliers.",
  },
  {
    icon: ScrollText,
    tag: "Governance",
    title: "Audit & control",
    body: "Every action recorded to an immutable trail, with role-based access for admin, operations and finance.",
  },
];

const STEPS = [
  {
    title: "Register & get verified",
    body: "Create your company and upload compliance documents. Our team reviews and verifies before you trade.",
  },
  {
    title: "Publish & source",
    body: "List your products, or raise RFQs targeted at exactly the category of counterparty you need.",
  },
  {
    title: "Trade & track",
    body: "Accept the best quotation — the order snapshots the agreed terms and is tracked to delivery.",
  },
];

const FOOTER_GROUPS = [
  {
    heading: "Platform",
    links: NAV_LINKS,
  },
  {
    heading: "Get started",
    links: [
      { href: "/register", label: "Register your company" },
      { href: "/login", label: "Sign in" },
      { href: "/forgot-password", label: "Reset password" },
    ],
  },
  {
    heading: "Legal",
    links: [{ href: "/privacy", label: "Privacy policy" }],
  },
];

async function publicStats(): Promise<{ verifiedCompanies: number } | null> {
  try {
    const res = await fetch(`${API_URL}/stats/public`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return (await res.json()) as { verifiedCompanies: number };
  } catch {
    return null;
  }
}

export default async function LandingPage() {
  const session = await auth();
  if (session) redirect("/dashboard");
  const stats = await publicStats();

  return (
    <ThemeOnlyProviders>
      <div className="flex min-h-screen flex-col bg-background">
        {/* Announcement topbar */}
        <div className="border-b bg-muted/40">
          <div className="mx-auto flex h-9 w-full max-w-6xl items-center justify-center gap-4 px-4 text-xs text-muted-foreground sm:justify-between sm:px-6">
            <p className="flex items-center gap-2 truncate">
              <span className="size-1.5 shrink-0 rounded-full bg-success" aria-hidden />
              Now onboarding manufacturers, suppliers & distributors worldwide — verification
              included
            </p>
            <Link
              href="/register"
              className="hidden shrink-0 items-center gap-1 font-medium text-primary hover:underline sm:flex"
            >
              Get verified <ArrowRight className="size-3" />
            </Link>
          </div>
        </div>

        {/* Floating glass pill nav */}
        <header className="sticky top-3 z-40 px-2 sm:px-6">
          <div className="glass-nav mx-auto flex h-14 w-full max-w-5xl items-center justify-between rounded-full pr-2 pl-3 sm:pr-2.5 sm:pl-5">
            <Link href="/" aria-label="PharmaChain home">
              <Logo markClassName="size-7 sm:size-8" wordClassName="text-base sm:text-xl" />
            </Link>
            <nav className="hidden items-center gap-1 md:flex" aria-label="Landing sections">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="rounded-full px-3.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/70 hover:text-foreground"
                >
                  {link.label}
                </a>
              ))}
            </nav>
            <div className="flex items-center gap-1.5">
              <ThemeToggle />
              <Button asChild variant="ghost" className="hidden rounded-full sm:inline-flex">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild className="rounded-full px-3.5 sm:px-5">
                <Link href="/register">
                  Get started <ArrowRight className="hidden sm:inline" />
                </Link>
              </Button>
            </div>
          </div>
        </header>

        <main className="flex-1">
          {/* Hero — daylight-sky panel, the nav floating over its top edge */}
          <section className="px-3 sm:px-5">
            <div className="sky-scope relative mx-auto -mt-[4.25rem] w-full max-w-[86rem] overflow-hidden rounded-[1.75rem] bg-panel-sky shadow-[0_48px_110px_-48px_oklch(0.32_0.11_250/0.6)] sm:rounded-[2.5rem]">
              <div aria-hidden className="absolute inset-0 bg-panel-grid opacity-45" />
              {/* Wireframe globe, centred in the hero's right column (≥lg).
                  Mirrors the content grid's own column template with a blank
                  first cell, so the globe's centring lands in the same
                  right-hand track as the market cards it sits behind. */}
              <div
                aria-hidden
                className="absolute inset-0 hidden overflow-hidden lg:grid lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:px-14"
              >
                <div />
                <div className="flex items-center justify-center">
                  <HeroGlobe aurora={false} className="aspect-square w-full max-w-[28rem]" />
                </div>
              </div>

              <div className="relative grid gap-12 px-6 pt-28 pb-14 sm:px-10 sm:pt-32 lg:grid-cols-[1.05fr_0.95fr] lg:px-14 lg:pb-24">
                <div>
                  <p className="eyebrow text-foreground/70">
                    <Sparkles className="size-3.5" />
                    The global pharmaceutical supply network
                  </p>
                  <h1 className="text-display mt-6 text-[2.85rem] text-balance sm:text-6xl xl:text-[4.9rem]">
                    Global pharma trade, verified end to end
                  </h1>
                  <p className="mt-6 max-w-xl text-base text-foreground/80 sm:text-lg">
                    PharmaChain runs every deal from RFQ to delivered — verified counterparties,
                    versioned quotations, tracked shipments and compliant document exchange on one
                    audit-trailed workspace, wherever your supply chain reaches.
                  </p>
                  <div className="mt-9 flex flex-wrap items-center gap-3">
                    <Button asChild size="xl" className="rounded-full shadow-lg shadow-black/20">
                      <Link href="/register">
                        Register your company <ArrowRight />
                      </Link>
                    </Button>
                    <Button
                      asChild
                      size="xl"
                      className="rounded-full border-0 bg-white text-[oklch(0.22_0.032_256)] shadow-lg shadow-black/10 hover:bg-white/90"
                    >
                      <Link href="/login">Sign in</Link>
                    </Button>
                  </div>
                  <ul className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-foreground/75">
                    <li className="flex items-center gap-1.5">
                      <ShieldCheck className="size-4" /> Every counterparty verified
                    </li>
                    <li className="flex items-center gap-1.5">
                      <ScrollText className="size-4" /> Immutable audit trail
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Lock className="size-4" /> GDPR-ready by design
                    </li>
                  </ul>
                  <HeroTickerRow
                    className="mt-10 lg:hidden"
                    verifiedCompanies={stats?.verifiedCompanies}
                  />
                </div>

                <HeroMarketCards
                  className="hidden min-h-[26rem] lg:block"
                  verifiedCompanies={stats?.verifiedCompanies}
                />
              </div>
            </div>
          </section>

          {/* Stat band — display numerals */}
          <section className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-10 pt-16 pb-6 lg:grid-cols-4">
              {STATS.map((stat) => (
                <div key={stat.label} className="border-l-2 border-primary/25 pl-4">
                  <dd className="text-display text-4xl tabular-nums sm:text-5xl">{stat.value}</dd>
                  <dt className="mt-2 text-sm text-muted-foreground">{stat.label}</dt>
                </div>
              ))}
            </dl>
          </section>
          <RouteMarquee />

          {/* Audiences */}
          <section id="network" className="scroll-mt-24">
            <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
              <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr] lg:items-end">
                <div>
                  <p className="eyebrow text-primary">Who it's for</p>
                  <h2 className="text-display mt-4 text-3xl sm:text-[2.6rem]">
                    Built for every side of the supply chain
                  </h2>
                </div>
                <p className="text-muted-foreground lg:pb-1">
                  One verified network — whether you make, source or move pharmaceutical products,
                  on any continent.
                </p>
              </div>
              <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                {AUDIENCES.map((audience) => (
                  <div
                    key={audience.title}
                    className="group rounded-3xl border bg-card p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:shadow-primary/10"
                  >
                    <span className="inline-flex size-11 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-info text-primary-foreground shadow-md shadow-primary/25">
                      <audience.icon className="size-5" />
                    </span>
                    <h3 className="mt-5 font-semibold">{audience.title}</h3>
                    <p className="mt-1.5 text-sm text-muted-foreground">{audience.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Platform — onyx showcase with chrome motifs */}
          <section id="platform" className="dark scroll-mt-24 bg-background text-foreground">
            <div className="relative overflow-hidden border-y border-border">
              <div
                aria-hidden
                className="absolute inset-0 bg-[radial-gradient(50rem_22rem_at_50%_-6rem,color-mix(in_oklch,var(--primary)_26%,transparent),transparent_70%)]"
              />
              <div aria-hidden className="absolute inset-x-0 top-0 h-[32rem] bg-grid-fade" />
              <div aria-hidden className="absolute top-16 right-[4%] hidden w-64 lg:block xl:w-72">
                <ChromeCube className="animate-float" />
              </div>
              <div aria-hidden className="absolute top-52 right-[27%] hidden w-16 xl:block">
                <ChromeSphere className="animate-float" />
              </div>
              <div className="relative mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-28">
                <p className="eyebrow text-primary">The platform</p>
                <h2 className="text-display mt-4 max-w-2xl text-4xl text-balance sm:text-6xl">
                  Everything a regulated trade needs
                </h2>
                <p className="mt-5 max-w-xl text-muted-foreground">
                  One workspace from first enquiry to delivered order — no email chains, no
                  spreadsheets.
                </p>
                <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {FEATURES.map((feature) => (
                    <div
                      key={feature.title}
                      className="group rounded-2xl border bg-card/70 p-6 backdrop-blur-sm transition-colors duration-300 hover:border-primary/40 hover:bg-card"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                          <feature.icon className="size-4.5" />
                        </span>
                        <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-semibold tracking-[0.14em] text-secondary-foreground uppercase">
                          {feature.tag}
                        </span>
                      </div>
                      <h3 className="mt-5 font-semibold">{feature.title}</h3>
                      <p className="mt-1.5 text-sm text-muted-foreground">{feature.body}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* How it works */}
          <section id="how" className="scroll-mt-24">
            <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
              <div className="text-center">
                <p className="eyebrow justify-center text-primary">How it works</p>
                <h2 className="text-display mt-4 text-3xl sm:text-[2.6rem]">
                  Up and trading in three steps
                </h2>
              </div>
              <ol className="relative mt-14 grid gap-12 md:grid-cols-3 md:gap-8">
                <div
                  aria-hidden
                  className="absolute top-5 right-[16%] left-[16%] hidden border-t border-dashed border-border md:block"
                />
                {STEPS.map((step, index) => (
                  <li key={step.title} className="relative">
                    <span
                      aria-hidden
                      className="text-display pointer-events-none absolute -top-7 right-0 text-8xl text-primary/[0.08] select-none dark:text-primary/[0.16]"
                    >
                      0{index + 1}
                    </span>
                    <span className="relative inline-flex size-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/30 ring-4 ring-background">
                      {index + 1}
                    </span>
                    <h3 className="mt-5 font-semibold">{step.title}</h3>
                    <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{step.body}</p>
                  </li>
                ))}
              </ol>
            </div>
          </section>

          {/* Final CTA */}
          <section className="mx-auto w-full max-w-6xl px-4 pb-24 sm:px-6">
            <div className="relative overflow-hidden rounded-[2rem] bg-panel-azure px-6 py-16 text-center sm:px-12 sm:py-20">
              <div aria-hidden className="absolute inset-0 bg-panel-grid" />
              <div
                aria-hidden
                className="absolute inset-0 bg-[radial-gradient(42rem_18rem_at_50%_-6rem,oklch(1_0_0/0.18),transparent)]"
              />
              <div className="relative">
                <h2 className="text-display text-4xl text-balance text-white sm:text-5xl">
                  Ready to trade with verified partners?
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-white/80">
                  Register your company today. Start on the Freemium plan — no card required.
                </p>
                <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                  {/* Brand-fixed panel: white pill + ghost pill, both themes */}
                  <Button
                    asChild
                    size="xl"
                    className="rounded-full border-0 bg-white text-[oklch(0.25_0.04_255)] shadow-lg hover:bg-white/90"
                  >
                    <Link href="/register">
                      Create your account <ArrowRight />
                    </Link>
                  </Button>
                  <Button
                    asChild
                    size="xl"
                    variant="outline"
                    className="rounded-full border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
                  >
                    <Link href="/login">Sign in</Link>
                  </Button>
                </div>
              </div>
            </div>
          </section>
        </main>

        <footer className="border-t bg-muted/20">
          <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
            <div>
              <Link href="/" aria-label="PharmaChain home">
                <Logo markClassName="size-8" wordClassName="text-lg" />
              </Link>
              <p className="mt-4 max-w-xs text-sm text-muted-foreground">
                The global verified network for pharmaceutical sourcing and logistics — RFQ to
                delivered, fully audit-trailed.
              </p>
            </div>
            {FOOTER_GROUPS.map((group) => (
              <nav key={group.heading} aria-label={group.heading}>
                <p className="text-sm font-semibold">{group.heading}</p>
                <ul className="mt-3 space-y-2.5">
                  {group.links.map((link) => (
                    <li key={link.href}>
                      <Link
                        href={link.href}
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
          <div className="border-t">
            <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 sm:flex-row sm:px-6">
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <LogoMark className="size-5" />© 2026 PharmaChain · The global pharmaceutical supply
                network
              </p>
              <p className="text-xs text-muted-foreground">
                Kampala · Nairobi · Mumbai · Shanghai · Rotterdam · São Paulo
              </p>
            </div>
          </div>
        </footer>
      </div>
    </ThemeOnlyProviders>
  );
}
