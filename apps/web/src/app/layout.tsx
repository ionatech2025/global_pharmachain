import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { ServiceWorker } from "@/components/service-worker";

// Self-hosted via next/font: same-origin, preloaded, size-adjusted fallback —
// no external font request and no layout shift.
const fontSans = Geist({ subsets: ["latin"], variable: "--font-geist-sans" });
const fontMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono" });

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pharmachain-seven.vercel.app";
const SHARE_DESCRIPTION =
  "Source pharmaceutical raw materials and finished products from verified companies — RFQs, quotations, orders, shipment tracking and compliant document exchange.";

export const metadata: Metadata = {
  // Absolute base so the file-convention opengraph-image / twitter-image and
  // any relative URLs resolve to fully-qualified links in share previews.
  metadataBase: new URL(SITE_URL),
  title: { default: "PharmaChain", template: "%s · PharmaChain" },
  description: "B2B pharmaceutical sourcing and procurement platform",
  applicationName: "PharmaChain",
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
    title: "PharmaChain — verified B2B pharmaceutical marketplace",
    description: SHARE_DESCRIPTION,
    url: "/",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "PharmaChain — verified B2B pharmaceutical marketplace",
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
      className={`${fontSans.variable} ${fontMono.variable}`}
    >
      <body className="min-h-screen font-sans antialiased">
        <Providers>{children}</Providers>
        <ServiceWorker />
      </body>
    </html>
  );
}
