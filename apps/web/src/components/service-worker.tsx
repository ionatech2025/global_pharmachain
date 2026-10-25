"use client";

import { SpeedInsights } from "@vercel/speed-insights/next";
import { useEffect, useState } from "react";

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Registers the PWA service worker after load (production only) and mounts
 * Vercel Speed Insights only when served on a non-loopback host (where Vercel's
 * `/_vercel/speed-insights/script.js` edge route actually exists). On local
 * standalone or Docker runs, skipping the collector avoids a 404/nosniff
 * console error on every page load while keeping production telemetry intact.
 */
export function ServiceWorker() {
  const [collectVitals, setCollectVitals] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!LOOPBACK_HOSTS.has(window.location.hostname)) {
      setCollectVitals(true);
    }
    if (!("serviceWorker" in navigator)) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const register = () => {
      timer = setTimeout(() => {
        navigator.serviceWorker.register("/sw.js").catch(() => {});
      }, 2_500);
    };
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register);
      return () => {
        window.removeEventListener("load", register);
        if (timer) clearTimeout(timer);
      };
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, []);

  return collectVitals ? <SpeedInsights /> : null;
}
