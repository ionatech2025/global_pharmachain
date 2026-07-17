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
