import type { Metadata } from "next";
import { ComplianceSection } from "@/components/landing/compliance-section";
import { FaqSection } from "@/components/landing/faq-section";
import { FinalCta } from "@/components/landing/final-cta";
import { HowItWorks } from "@/components/landing/how-it-works";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingHeader } from "@/components/landing/landing-header";
import { LandingHero } from "@/components/landing/landing-hero";
import { NumbersSection } from "@/components/landing/numbers-section";
import { TrustSection } from "@/components/landing/trust-section";
import { WorkflowSection } from "@/components/landing/workflow-section";
import { MallDirectoryGrid } from "@/components/mall-directory";
import { ThemeOnlyProviders } from "@/components/theme-only-providers";
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

// Static, regenerated every five minutes with the live stats: no per-visitor
// work happens here, so the page is served from the edge cache. The redirect
// for signed-in visitors lives in middleware.ts — reading the session here
// would make every visit a server render.
export const revalidate = 300;

export default async function LandingPage() {
  const verifiedCompanies = (await publicStats())?.verifiedCompanies ?? null;

  return (
    <ThemeOnlyProviders>
      <div className="relative isolate flex min-h-screen flex-col overflow-x-clip bg-background">
        <div
          aria-hidden
          className="landing-wash pointer-events-none absolute inset-x-0 top-0 -z-10 h-[68rem]"
        />
        <a
          href="#main"
          className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Skip to content
        </a>
        <LandingHeader />

        <main id="main" tabIndex={-1} className="flex-1 outline-none">
          <LandingHero verifiedCompanies={verifiedCompanies} />
          <MallDirectoryGrid />
          <HowItWorks />
          <TrustSection />
          <WorkflowSection />
          <NumbersSection verifiedCompanies={verifiedCompanies} />
          <FaqSection />
          <ComplianceSection />
          <FinalCta />
        </main>

        <LandingFooter />
      </div>
    </ThemeOnlyProviders>
  );
}
