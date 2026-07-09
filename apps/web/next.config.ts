import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source (just-in-time packages)
  transpilePackages: ["@pharmachain/ui", "@pharmachain/core", "@pharmachain/auth"],
  // Self-contained server output for the optional Docker deployment
  output: "standalone",
};

export default nextConfig;
