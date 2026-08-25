import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata, Viewport } from "next";
import { Anton, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ServiceWorker } from "@/components/service-worker";
import { SITE_URL } from "@/env";

// Self-hosted via next/font: same-origin, preloaded, size-adjusted fallback —
// no external font request and no layout shift.
const fontSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const fontMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });
// Condensed grotesque reserved for display headlines (marketing surfaces).
const fontDisplay = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton" });

const SHARE_DESCRIPTION =
  "The global verified network for pharmaceutical sourcing and logistics — RFQs, quotations, orders, shipment tracking and compliant document exchange, worldwide.";

export const metadata: Metadata = {
  // Absolute base so the file-convention opengraph-image / twitter-image and
  // any relative URLs resolve to fully-qualified links in share previews.
  metadataBase: new URL(SITE_URL),
  title: { default: "PharmaChain", template: "%s · PharmaChain" },
  description: "B2B pharmaceutical sourcing and procurement platform",
  applicationName: "PharmaChain",
  // Explicit canonical: without it, the wrong-domain history this site has
  // had (metadataBase once fell back to a stale alias) can leave crawlers
  // with duplicate-content signals pointing at more than one host.
  alternates: { canonical: "/" },
  // manifest.ts is auto-linked; these add iOS standalone/PWA support.
  appleWebApp: {
    capable: true,
    title: "PharmaChain",
    statusBarStyle: "default",
  },
  // Social share card (the opengraph-image.png / twitter-image.png file
  // conventions supply the image + dimensions automatically).
  openGraph: {
    type: "website",
    siteName: "PharmaChain",
    title: "PharmaChain — the global verified pharmaceutical marketplace",
    description: SHARE_DESCRIPTION,
    url: "/",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "PharmaChain — the global verified pharmaceutical marketplace",
    description: SHARE_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#060709" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fontSans.variable} ${fontMono.variable} ${fontDisplay.variable}`}
    >
      <body className="min-h-screen font-sans antialiased">
        {children}
        <ServiceWorker />
        {/* Injects its collector client-side, so CSP 'strict-dynamic' trusts
            it without a nonce; vitals POST to /_vercel/* is same-origin. */}
        <SpeedInsights />
      </body>
    </html>
  );
}
