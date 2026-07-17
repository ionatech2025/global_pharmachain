import type { NextConfig } from "next";

// Defence-in-depth headers on every web route (the API function already sets
// its own via helmet). Vercel adds HSTS; these cover the rest. No script-src
// CSP: Next injects inline bootstrap scripts that would need per-request
// nonces (a middleware concern) — instead we lock down the injection vectors
// that don't require nonces (framing, object/base, sniffing).
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'self'; object-src 'none'; base-uri 'self'",
  },
];

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source (just-in-time packages)
  transpilePackages: ["@pharmachain/ui", "@pharmachain/core", "@pharmachain/auth"],
  // Self-contained server output for the optional Docker deployment
  output: "standalone",
  poweredByHeader: false,
  experimental: {
    // Rewrite barrel imports to per-file imports at build time — smaller
    // client chunks and faster compiles. lucide-react is already on Next's
    // built-in list; these cover the workspace packages.
    optimizePackageImports: ["@pharmachain/ui", "@pharmachain/core"],
  },
  async headers() {
    // Applies to every Next-served route; excludes the /api/backend function
    // (it sets its own headers via helmet) to avoid duplicate/conflicting ones.
    return [{ source: "/((?!api/backend/).*)", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
