import type { NextConfig } from "next";

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
};

export default nextConfig;
