import { Button } from "@pharmachain/ui/components/button";
import {
  ArrowRight,
  FileText,
  Landmark,
  ListChecks,
  Mail,
  MessageSquare,
  Phone,
  Scale,
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
import { MallDirectoryGrid } from "@/components/mall-directory";
import { RouteMarquee } from "@/components/route-marquee";
import { ThemeOnlyProviders } from "@/components/theme-only-providers";
import { ThemeToggle } from "@/components/theme-toggle";
import { API_URL } from "@/env";

const SHARE_DESCRIPTION =
  "The Unified End-to-End B2B Pharma Ecosystem for Pharmaceutical Procurement. Interlinking Manufacturers of Raw Materials and supplier verification across Upstream Inputs, Midstream Manufacturing Assets, and Downstream Wholesale Distribution.";

export const metadata: Metadata = {
  title: { absolute: "Global PharmaChain — Unified B2B Pharma Procurement Ecosystem" },
  description: SHARE_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Global PharmaChain",
    title: "Global PharmaChain — Unified B2B Pharma Procurement Ecosystem",
    description: SHARE_DESCRIPTION,
    url: "/",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Global PharmaChain — Unified B2B Pharma Procurement Ecosystem",
    description: SHARE_DESCRIPTION,
  },
};

const NAV_LINKS = [
  { href: "#mall-directory", label: "Mall Directory" },
  { href: "#platform", label: "Platform" },
  { href: "#how", label: "How it works" },
  { href: "#compliance", label: "Compliance & Legal" },
];

const STATS = [
  { value: "3 Lanes", label: "Upstream Inbound, Midstream Hub & Downstream Outbound" },
  { value: "100%", label: "Of transactions verified via Secure Audit Ledger" },
  { value: "LC & Wire", label: "Corporate Letters of Credit, Bank Wire & Escrow" },
  { value: "13 Stages", label: "Forward-only GPS & Cold-Chain Shipment Milestones" },
];

const FEATURES = [
  {
    icon: Search,
    tag: "Mall Directory",
    title: "Verified Sourcing Lanes",
    body: "Pre-screened directory for APIs, excipients, FDF formulations, and wholesale medications — credentials validated before any deal.",
  },
  {
    icon: ListChecks,
    tag: "Trade Execution",
    title: "Targeted RFQs & Bids",
    body: "Structured User Requirement Specifications (URS), versioned quotations with full audit trails, and competitive evaluation.",
  },
  {
    icon: Truck,
    tag: "Logistics",
    title: "End-to-End Shipment Ledger",
    body: "Thirteen forward-only stages with temperature checkpoints, customs clearance tracking, and cryptographic proof of delivery.",
  },
  {
    icon: FileText,
    tag: "Quality & Regulatory",
    title: "Compliance Document Vault",
    body: "Controlled repository for GMP certificates, CoAs, DMFs, and import/export licenses with automated expiry notifications.",
  },
  {
    icon: MessageSquare,
    tag: "Communication",
    title: "Confidential Pairwise Threads",
    body: "Segregated negotiation rooms for every tender and procurement contract — zero data leakage across competing suppliers.",
  },
  {
    icon: ScrollText,
    tag: "Governance",
    title: "Immutable Secure Ledger",
    body: "Every event timestamped and sealed to an immutable cryptographic audit trail with role-based governance for corporate controllers.",
  },
];

const STEPS = [
  {
    title: "Corporate Verification",
    body: "Register your company, select your trading tier, and submit regional regulatory credentials (GMP, manufacturing licenses, tax IDs).",
  },
  {
    title: "Publish & Match",
    body: "List your available capacity and stock, or publish targeted RFQs with User Requirement Specifications (URS) to qualified suppliers.",
  },
  {
    title: "Contract & Track",
    body: "Execute agreements backed by Cryptographic Escrow Verification, settle via corporate bank wires or LC, and track shipments to the door.",
  },
];

const FOOTER_GROUPS = [
  {
    heading: "Platform",
    links: [
      { href: "#mall-directory", label: "Mall Directory" },
      { href: "#platform", label: "Enterprise Platform" },
      { href: "#how", label: "How it Works" },
      { href: "/verify", label: "Trace Verification" },
    ],
  },
  {
    heading: "Trading Lanes",
    links: [
      {
        href: "/register?type=RAW_MATERIAL_MANUFACTURER&action=source_raw",
        label: "Upstream (APIs & Inputs)",
      },
      {
        href: "/register?type=FINISHED_PRODUCT_MANUFACTURER&action=list_capacity",
        label: "Midstream (Manufacturing Hub)",
      },
      {
        href: "/register?type=FINISHED_PRODUCT_DISTRIBUTOR&action=procure_bulk",
        label: "Downstream (Wholesale Distribution)",
      },
    ],
  },
  {
    heading: "Contact & Legal",
    links: [
      { href: "mailto:contact@globalpharmachain.com", label: "contact@globalpharmachain.com" },
      { href: "tel:+256700000000", label: "+256 700 000 000" },
      { href: "/disclaimer", label: "Regulatory Disclaimer" },
      { href: "/privacy", label: "Privacy Policy" },
    ],
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
          <div className="mx-auto flex h-9 w-full max-w-7xl items-center justify-center gap-4 px-4 text-xs text-muted-foreground sm:justify-between sm:px-6">
            <p className="flex items-center gap-2 truncate">
              <span className="size-1.5 shrink-0 rounded-full bg-success" aria-hidden />
              Enterprise Pharma Sourcing: Interlinking Upstream Raw Inputs, Midstream Assets &
              Downstream Distribution
            </p>
            <Link
              href="/register"
              className="hidden shrink-0 items-center gap-1 font-medium text-primary hover:underline sm:flex"
            >
              Onboard Your Company <ArrowRight className="size-3" />
            </Link>
          </div>
        </div>

        {/* Floating glass pill nav */}
        <header className="sticky top-3 z-40 px-2 sm:px-6">
          <div className="glass-nav mx-auto flex h-14 w-full max-w-6xl items-center justify-between rounded-full pr-2 pl-3 sm:pr-2.5 sm:pl-5">
            <Link href="/" aria-label="Global PharmaChain home">
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
          {/* Hero — daylight-sky panel */}
          <section className="px-3 sm:px-5">
            <div className="sky-scope relative mx-auto -mt-[4.25rem] w-full max-w-[88rem] overflow-hidden rounded-[1.75rem] bg-panel-sky shadow-[0_48px_110px_-48px_oklch(0.32_0.11_250/0.6)] sm:rounded-[2.5rem]">
              <div aria-hidden className="absolute inset-0 bg-panel-grid opacity-45" />
              <div
                aria-hidden
                className="absolute inset-0 hidden overflow-hidden lg:grid lg:grid-cols-[1.1fr_0.9fr] lg:gap-12 lg:px-14"
              >
                <div />
                <div className="flex items-center justify-center">
                  <HeroGlobe aurora={false} className="aspect-square w-full max-w-[28rem]" />
                </div>
              </div>

              <div className="relative grid gap-10 px-6 pt-28 pb-14 sm:px-10 sm:pt-32 lg:grid-cols-[1.15fr_0.85fr] lg:px-14 lg:pb-24">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/50 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-primary backdrop-blur-sm">
                    <Sparkles className="size-3.5" />
                    Global B2B Pharmaceutical Network
                  </div>

                  {/* Primary Hero Headline */}
                  <h1 className="text-display mt-5 text-[2.4rem] leading-[1.12] text-balance sm:text-5xl xl:text-[3.8rem] font-bold text-foreground">
                    The Unified End-to-End B2B Pharma Ecosystem for Pharmaceutical Procurement
                  </h1>

                  {/* Subheadline: explicitly encompassing all 3 tiers */}
                  <p className="mt-5 max-w-2xl text-base text-foreground/85 sm:text-lg leading-relaxed">
                    Interlinking Manufacturers of Raw Materials and supplier verification across{" "}
                    <strong>Upstream Inputs</strong>,{" "}
                    <strong>Midstream Manufacturing Assets</strong>, and{" "}
                    <strong>Downstream Wholesale Distribution</strong>.
                  </p>

                  {/* The 3-Button Action Matrix (Hero Section) */}
                  <div className="mt-8 grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-3xl">
                    <Button
                      asChild
                      size="lg"
                      className="h-auto py-3 px-4 flex flex-col items-start text-left rounded-2xl bg-sky-600 hover:bg-sky-700 text-white shadow-md transition-all hover:scale-[1.02]"
                    >
                      <Link
                        href="/register?type=FINISHED_PRODUCT_MANUFACTURER&action=source_raw"
                        aria-label="Source Raw Materials & Consumables - for manufacturers buying inputs"
                      >
                        <span className="font-semibold text-sm">
                          Source Raw Materials & Consumables
                        </span>
                        <span className="text-[11px] opacity-90 font-normal mt-0.5">
                          For Manufacturers buying inputs
                        </span>
                      </Link>
                    </Button>

                    <Button
                      asChild
                      size="lg"
                      className="h-auto py-3 px-4 flex flex-col items-start text-left rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition-all hover:scale-[1.02]"
                    >
                      <Link
                        href="/register?type=FINISHED_PRODUCT_MANUFACTURER&action=list_capacity"
                        aria-label="List Formulations & Capacity - for manufacturers and CDMOs"
                      >
                        <span className="font-semibold text-sm">List Formulations & Capacity</span>
                        <span className="text-[11px] opacity-90 font-normal mt-0.5">
                          For Manufacturers & CDMOs
                        </span>
                      </Link>
                    </Button>

                    <Button
                      asChild
                      size="lg"
                      className="h-auto py-3 px-4 flex flex-col items-start text-left rounded-2xl bg-teal-600 hover:bg-teal-700 text-white shadow-md transition-all hover:scale-[1.02]"
                    >
                      <Link
                        href="/register?type=FINISHED_PRODUCT_DISTRIBUTOR&action=procure_bulk"
                        aria-label="Procure Bulk Medications - for wholesale traders, distributors, and institutions"
                      >
                        <span className="font-semibold text-sm">Procure Bulk Medications</span>
                        <span className="text-[11px] opacity-90 font-normal mt-0.5">
                          For Wholesale & Institutions
                        </span>
                      </Link>
                    </Button>
                  </div>

                  {/* Re-Architected Narrative: Utility, Not Tokens */}
                  <ul className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs sm:text-sm text-foreground/80">
                    <li className="flex items-center gap-1.5">
                      <ShieldCheck className="size-4 text-primary" /> Cryptographic Escrow
                      Verification
                    </li>
                    <li className="flex items-center gap-1.5">
                      <ScrollText className="size-4 text-primary" /> Secure Audit Ledger
                    </li>
                    <li className="flex items-center gap-1.5">
                      <Landmark className="size-4 text-primary" /> Bank Wire, Corporate Accounts &
                      LC
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
                  <dd className="text-display text-3xl font-bold tabular-nums sm:text-4xl text-foreground">
                    {stat.value}
                  </dd>
                  <dt className="mt-2 text-xs sm:text-sm text-muted-foreground">{stat.label}</dt>
                </div>
              ))}
            </dl>
          </section>
          <RouteMarquee />

          {/* Interactive "Mall Directory" Grid detailing the 3 Trading Lanes */}
          <MallDirectoryGrid />

          {/* Platform — enterprise showcase */}
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
                <p className="eyebrow text-primary">Enterprise Infrastructure</p>
                <h2 className="text-display mt-4 max-w-2xl text-3xl sm:text-5xl font-bold">
                  Engineered Specifically for Complex Pharma Workflows
                </h2>
                <p className="mt-4 max-w-xl text-muted-foreground">
                  An enterprise-grade B2B infrastructure layer — not generic e-commerce. Built to
                  enforce GMP compliance, traceable chain-of-custody, and pairwise confidential deal
                  structures.
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
                      <h3 className="mt-5 font-semibold text-foreground">{feature.title}</h3>
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
                <h2 className="text-display mt-4 text-3xl sm:text-[2.6rem] font-bold">
                  Corporate Onboarding to Delivery in Three Steps
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

          {/* Prominent Legal Disclaimer Statement Section */}
          <section id="compliance" className="scroll-mt-24 border-t bg-muted/30 py-16">
            <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
              <div className="rounded-3xl border border-border/80 bg-card p-6 sm:p-10 shadow-sm">
                <div className="flex items-center gap-2 text-primary mb-3">
                  <Scale className="size-5" />
                  <span className="text-xs font-semibold uppercase tracking-wider">
                    Corporate Compliance & Regulatory Notice
                  </span>
                </div>
                <h3 className="text-2xl font-bold text-foreground mb-4">
                  Legal Disclaimer & Regulatory Compliance
                </h3>

                <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
                  <p className="font-medium text-foreground">
                    Legal Disclaimer: Global Pharmachain operates strictly as an independent B2B
                    matching directory and secure open-ledger information infrastructure layer. This
                    platform does not directly manufacture, formulate, dispense, store, transport,
                    market, distribute, or prescribe therapeutic medications, active pharmaceutical
                    ingredients (APIs), or medical consumables.
                  </p>

                  <p>
                    All transactions, negotiations, regulatory filings, and quality assurance
                    protocols are executed strictly between the independent verified corporate
                    entities (Suppliers, Manufacturers, and Distributors) utilizing the network.
                    Users are entirely responsible for securing and maintaining all required
                    regional regulatory compliance, import/export licenses, and certifications
                    (including but not limited to FDA, EMA, WHO-GMP, and local country
                    authorizations) necessary to trade pharmaceutical products.
                  </p>

                  <p>
                    <strong>Regulatory Compliance & Liability Limitation:</strong> The information,
                    dossiers, and product listings displayed within this marketplace are provided
                    solely for corporate procurement discovery and logistical coordination. Global
                    Pharmachain does not independently verify the bio-equivalence, purity, chemical
                    stability, or regulatory validity of listed compounds or finished products.
                  </p>

                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs sm:text-sm text-amber-950 dark:text-amber-200">
                    It is the sole, non-delegable duty of the purchasing manufacturer or downstream
                    distributor to perform full laboratory analytical testing, batch verification,
                    and comprehensive due diligence prior to product release or human
                    administration. Global Pharmachain expressly disclaims all liability for supply
                    chain disruptions, regulatory enforcement actions, or adverse therapeutic events
                    arising from transactions initiated on the platform.
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-4 pt-4 border-t border-border/60 text-xs">
                  <Link href="/disclaimer" className="text-primary font-medium underline">
                    Read Full Legal Statement & Liability Limitations →
                  </Link>
                  <span className="text-muted-foreground">·</span>
                  <Link href="/privacy" className="text-muted-foreground hover:text-foreground">
                    Privacy Policy
                  </Link>
                </div>
              </div>
            </div>
          </section>

          {/* Final CTA */}
          <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
            <div className="relative overflow-hidden rounded-[2rem] bg-panel-azure px-6 py-16 text-center sm:px-12 sm:py-20">
              <div aria-hidden className="absolute inset-0 bg-panel-grid" />
              <div
                aria-hidden
                className="absolute inset-0 bg-[radial-gradient(42rem_18rem_at_50%_-6rem,oklch(1_0_0/0.18),transparent)]"
              />
              <div className="relative">
                <h2 className="text-display text-3xl text-balance text-white sm:text-5xl font-bold">
                  Connect to the Global Pharma Sourcing Network
                </h2>
                <p className="mx-auto mt-4 max-w-2xl text-white/85 text-sm sm:text-base">
                  Join verified pharmaceutical manufacturers, suppliers, and distributors across
                  three unified trading lanes.
                </p>
                <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                  <Button
                    asChild
                    size="xl"
                    className="rounded-full border-0 bg-white text-[oklch(0.25_0.04_255)] shadow-lg hover:bg-white/90"
                  >
                    <Link href="/register">
                      Register Your Company <ArrowRight />
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
              <Link href="/" aria-label="Global PharmaChain home">
                <Logo markClassName="size-8" wordClassName="text-lg" />
              </Link>
              <p className="mt-4 max-w-xs text-sm text-muted-foreground leading-relaxed">
                The global verified network for pharmaceutical sourcing and logistics — RFQ to
                delivered, fully audit-trailed.
              </p>

              {/* Direct Email & Contact (Page 7) */}
              <div className="mt-5 space-y-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Mail className="size-3.5 text-primary shrink-0" />
                  <a
                    href="mailto:contact@globalpharmachain.com"
                    className="hover:text-foreground underline"
                  >
                    contact@globalpharmachain.com
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="size-3.5 text-primary shrink-0" />
                  <a href="tel:+256700000000" className="hover:text-foreground">
                    +256 700 000 000 / +254 700 000 000
                  </a>
                </div>
              </div>
            </div>

            {FOOTER_GROUPS.map((group) => (
              <nav key={group.heading} aria-label={group.heading}>
                <p className="text-sm font-semibold text-foreground">{group.heading}</p>
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
                <LogoMark className="size-5" />© 2026 Global PharmaChain · The global pharmaceutical
                supply network
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
