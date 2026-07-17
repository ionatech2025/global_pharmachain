import type { MetadataRoute } from "next";

// Web app manifest (auto-linked by Next at /manifest.webmanifest). Makes
// PharmaChain installable as a standalone app with the brand icons.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PharmaChain — B2B pharmaceutical marketplace",
    short_name: "PharmaChain",
    description:
      "Source pharmaceutical raw materials and finished products from verified companies — RFQs, quotations, orders, shipment tracking and compliant document exchange.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#fafafa",
    theme_color: "#0a4d80",
    categories: ["business", "productivity", "medical"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
