import type { MetadataRoute } from "next";

// Valid robots.txt (Next metadata route). Pages are crawlable — the app
// routes are auth-gated, so an unauthenticated crawler is redirected to
// /login and no content leaks. Only the JSON API surface is disallowed.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: "/api/",
      },
    ],
  };
}
