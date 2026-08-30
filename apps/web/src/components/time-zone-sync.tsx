"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { resolvedBrowserTimeZone } from "@/lib/format";

/** Name is shared with the (app) layout, which reads the cookie server-side. */
export const TZ_COOKIE = "pc_tz";

function readCookie(name: string): string | undefined {
  for (const part of document.cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return undefined;
}

/**
 * Backfills the viewer's time zone for server-rendered timestamps.
 *
 * Server components have no way to know where the browser is, so before this
 * every RSC-formatted date fell back to the *function's* zone — UTC on Vercel
 * — for anyone who had not filled in Account → Language & region. Timestamps
 * across the app (login activity, last login, audit) were silently off by the
 * viewer's UTC offset.
 *
 * The browser publishes its IANA zone in a cookie so the next server render
 * can use it. The first render of a new session predates the cookie, so
 * writing it for the first time refreshes once to redraw what was already
 * painted in UTC; afterwards the cookie rides along on every request and this
 * does nothing. The refresh is keyed on the *cookie* rather than on the zone
 * the server actually used: a viewer whose saved preference deliberately
 * differs from their browser zone would otherwise never stop refreshing.
 */
export function TimeZoneSync() {
  const router = useRouter();

  useEffect(() => {
    const zone = resolvedBrowserTimeZone();
    if (!zone || readCookie(TZ_COOKIE) === zone) return;
    // Lax so it also rides along on top-level navigations into the app.
    document.cookie = `${TZ_COOKIE}=${encodeURIComponent(zone)}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }, [router]);

  return null;
}
