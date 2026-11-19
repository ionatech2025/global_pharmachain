import { Button } from "@pharmachain/ui/components/button";
import { ArrowRight, BadgeCheck } from "lucide-react";
import Link from "next/link";

export function FinalCta() {
  return (
    <section aria-labelledby="cta-title" className="px-4 pt-8 pb-20 sm:px-6 sm:pb-24">
      <div className="bg-navy-panel dark relative mx-auto w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 px-6 py-16 text-center text-foreground shadow-[0_40px_90px_-40px_oklch(0.3_0.1_258/0.7)] sm:px-12 sm:py-20">
        <div aria-hidden className="absolute inset-0 bg-panel-grid" />
        <div className="relative">
          <span className="landing-pill">
            <BadgeCheck aria-hidden className="size-3.5" />
            Verified network
          </span>
          <h2
            id="cta-title"
            className="text-display mx-auto mt-5 max-w-3xl text-3xl text-balance sm:text-5xl"
          >
            Connect to the Global{" "}
            <span className="text-gradient-hero">Pharma Sourcing Network</span>
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-sm text-muted-foreground sm:text-lg">
            Join verified pharmaceutical manufacturers, suppliers, and distributors across three
            unified trading lanes.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Button
              asChild
              size="xl"
              className="rounded-xl border-0 bg-white text-[oklch(0.25_0.05_260)] shadow-lg hover:bg-white/90"
            >
              <Link href="/register">
                Register Your Company <ArrowRight />
              </Link>
            </Button>
            <Button
              asChild
              size="xl"
              variant="outline"
              className="rounded-xl border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white"
            >
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
