import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ServiceWorker } from "@/components/service-worker";
import { SITE_URL } from "@/env";

// Self-hosted via next/font: same-origin, preloaded, size-adjusted fallback —
// no external font request and no layout shift.
// Hercules design system: one humanist/geometric sans family across weights
// 400–700 for UI and display headlines, paired with Geist Mono for codes,
// hashes and tabular figures (preload:false so it never competes with the
// primary UI face on first paint).
const fontSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  preload: false,
});

export const metadata: Metadata = {
  // Absolute base so the file-convention opengraph-image / twitter-image and
  // any relative URLs resolve to fully-qualified links in share previews.
  metadataBase: new URL(SITE_URL),
  title: { default: "Global PharmaChain", template: "%s · Global PharmaChain" },
  description: "B2B pharmaceutical sourcing and procurement platform",
  applicationName: "Global PharmaChain",
  // manifest.ts is auto-linked; these add iOS standalone/PWA support.
  appleWebApp: {
    capable: true,
    title: "Global PharmaChain",
    statusBarStyle: "default",
  },
  // alternates/openGraph/twitter deliberately live on the landing page's own
  // metadata (page.tsx), not here: Next doesn't deep-merge these nested
  // objects across the layout tree, so a value set at this root level wins
  // wholesale on every route that doesn't declare its own — a hardcoded
  // canonical/og:url of "/" here was shipping on /marketplace, /dashboard,
  // every authenticated route, not just the page it was written for. Found
  // via a Lighthouse pass on inner (authenticated) pages, not the landing
  // page itself, where the bug was invisible.
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
      className={`${fontSans.variable} ${fontMono.variable}`}
    >
      <body className="min-h-screen font-sans antialiased">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
