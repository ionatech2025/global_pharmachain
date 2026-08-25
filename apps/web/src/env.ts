// Server-side configuration for the web app. AUTH_SECRET/AUTH_URL are read
// directly by Auth.js from the environment.
//
// The API ships as a serverless function inside THIS deployment, mounted at
// /api/backend. Server code (RSC + the browser proxy) calls it same-origin:
//   - explicit API_URL wins (local dev points at the standalone API on :3001)
//   - on Vercel, VERCEL_URL is this deployment's own host → same-deployment
//   - otherwise fall back to the local standalone API
function resolveApiUrl(): string {
  if (process.env.API_URL) return process.env.API_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}/api/backend`;
  return "http://localhost:3001";
}

export const API_URL = resolveApiUrl();

// Public site origin — metadataBase, canonical/OG/Twitter absolute URLs.
// Needs the stable *production* domain, not VERCEL_URL (this deployment's
// own throwaway host, which would put a preview's or even a stale prod
// deployment's hash-suffixed URL into every share card): explicit
// NEXT_PUBLIC_SITE_URL wins, then Vercel's system var for the project's
// actual production domain, then localhost for local dev.
function resolveSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return "http://localhost:3000";
}

export const SITE_URL = resolveSiteUrl();
