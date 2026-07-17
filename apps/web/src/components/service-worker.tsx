"use client";

import { useEffect } from "react";

/**
 * Registers the PWA service worker after load (production only). Kept as a
 * tiny client component mounted once in the root layout; failures are
 * swallowed so a registration hiccup never affects the app.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const register = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    }
  }, []);
  return null;
}
