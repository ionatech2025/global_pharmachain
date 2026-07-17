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
  Truck,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Logo, LogoMark } from "@/components/logo";

export const metadata: Metadata = {
  title: { absolute: "PharmaChain — verified B2B pharmaceutical marketplace" },
  description:
    "Source pharmaceutical raw materials and finished products from verified companies. RFQs, quotations, orders, shipment tracking and compliant document exchange — with a full audit trail.",
};

const AUDIENCES = [
  {
    icon: FlaskConical,
    title: "Raw-material manufacturers",
    body: "Publish APIs and excipients with CoAs, SDS and GMP credentials attached to every listing.",
  },
  {
    icon: Factory,
    title: "Finished-product manufacturers",
    body: "Source by bill of materials, raise targeted RFQs and compare quotations side by side.",
  },
  {
    icon: Package,
    title: "Suppliers & distributors",
    body: "Quote fast, win orders and keep buyers updated at every stage to the door.",
  },
];

const FEATURES = [
  {
    icon: Search,
    title: "Verified marketplace",
    body: "Search published catalogues from verified companies only — credentials reviewed before anyone can trade.",
  },
  {
    icon: ListChecks,
    title: "RFQs & quotations",
    body: "Targeted RFQs, versioned quotes with a full history, and side-by-side comparison for the award.",
  },
  {
    icon: Truck,
    title: "Shipment tracking",
    body: "Six forward-only stages with notes and ETAs; the buyer is notified on every transition.",
  },
  {
    icon: FileText,
    title: "Document vault",
    body: "Versioned compliance documents with expiry alerts and access-controlled sharing per deal.",
  },
  {
    icon: MessageSquare,
    title: "Deal messaging",
    body: "Pairwise threads on every RFQ, quotation and order — nothing ever leaks between competing suppliers.",
  },
  {
    icon: ScrollText,
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

export default async function LandingPage() {
  const session = await auth();
  if (session) redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" aria-label="PharmaChain home">
            <Logo markClassName="size-8" />
          </Link>
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild>
              <Link href="/register">
                Get started <ArrowRight />
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div aria-hidden className="absolute inset-0 -z-10 bg-hero-glow" />
          <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-[34rem] bg-grid-fade" />
          <div className="mx-auto flex w-full max-w-4xl flex-col items-center px-4 pt-20 pb-16 text-center sm:px-6 sm:pt-28">
            <p className="inline-flex items-center gap-2 rounded-full border bg-card px-3.5 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
              <span className="size-1.5 rounded-full bg-success" aria-hidden />
              Verified-only B2B pharmaceutical marketplace
            </p>
            <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-6xl">
              Pharmaceutical sourcing,
              <br />
              <span className="text-gradient">from RFQ to delivered</span>
            </h1>
            <p className="mt-6 max-w-2xl text-base text-muted-foreground sm:text-lg">
              PharmaChain connects verified manufacturers and suppliers. Publish catalogues, compare
              quotations, confirm orders and track every shipment — with compliant document exchange
              and a full audit trail underneath.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Button asChild size="lg">
                <Link href="/register">
                  Register your company <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/login">Sign in</Link>
              </Button>
            </div>
            <ul className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <li className="flex items-center gap-1.5">
                <ShieldCheck className="size-4 text-success" /> Every counterparty verified
              </li>
              <li className="flex items-center gap-1.5">
                <ScrollText className="size-4 text-success" /> Immutable audit trail
              </li>
              <li className="flex items-center gap-1.5">
                <Lock className="size-4 text-success" /> GDPR-ready by design
              </li>
            </ul>
          </div>
        </section>

        {/* Audiences */}
        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
            Built for every side of the supply chain
          </h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {AUDIENCES.map((audience) => (
              <div
                key={audience.title}
                className="rounded-xl border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
              >
                <span className="inline-flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <audience.icon className="size-5" />
                </span>
                <h3 className="mt-4 font-semibold">{audience.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{audience.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section className="border-y bg-muted/30">
          <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
              Everything a regulated trade needs
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
              One workspace from first enquiry to delivered order — no email chains, no
              spreadsheets.
            </p>
            <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map((feature) => (
                <div key={feature.title} className="rounded-xl border bg-card p-5">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <feature.icon className="size-4.5" />
                    </span>
                    <h3 className="font-semibold">{feature.title}</h3>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{feature.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-center text-2xl font-semibold tracking-tight sm:text-3xl">
            Up and trading in three steps
          </h2>
          <ol className="mt-10 grid gap-6 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="relative rounded-xl border bg-card p-6">
                <span className="inline-flex size-8 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {index + 1}
                </span>
                <h3 className="mt-4 font-semibold">{step.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Final CTA */}
        <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
          <div className="relative overflow-hidden rounded-2xl bg-primary px-6 py-14 text-center text-primary-foreground sm:px-12">
            <div
              aria-hidden
              className="absolute inset-0 bg-[radial-gradient(40rem_18rem_at_70%_-4rem,rgb(255_255_255/0.14),transparent)]"
            />
            <h2 className="relative text-2xl font-semibold tracking-tight sm:text-3xl">
              Ready to trade with verified partners?
            </h2>
            <p className="relative mx-auto mt-3 max-w-xl text-primary-foreground/85">
              Register your company today. Start on the Freemium plan — no card required.
            </p>
            <div className="relative mt-7">
              <Button asChild size="lg" variant="secondary">
                <Link href="/register">
                  Create your account <ArrowRight />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <div className="flex items-center gap-2.5">
            <LogoMark className="size-6" />
            <span className="text-sm text-muted-foreground">
              © 2026 PharmaChain · B2B pharmaceutical sourcing
            </span>
          </div>
          <nav className="flex items-center gap-5 text-sm text-muted-foreground">
            <Link href="/login" className="hover:text-foreground">
              Sign in
            </Link>
            <Link href="/register" className="hover:text-foreground">
              Register
            </Link>
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
