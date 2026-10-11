import type { MetadataRoute } from "next";
import { SITE_URL } from "@/env";

// The public pages only — everything else is behind sign-in and would be a
// redirect to /login for a crawler.
const PUBLIC_PATHS = ["/", "/register", "/login", "/verify", "/privacy", "/disclaimer"];

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({
    url: path === "/" ? SITE_URL : `${SITE_URL}${path}`,
    changeFrequency: path === "/" ? "daily" : "monthly",
    priority: path === "/" ? 1 : 0.5,
  }));
}
