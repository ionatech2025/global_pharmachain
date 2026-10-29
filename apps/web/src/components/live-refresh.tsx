"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Keeps a server-rendered page current: subscribes to an API change feed (SSE)
 * and re-renders the page in place when it fires. Client state survives
 * `router.refresh()`, so a half-typed quotation is not lost when the RFQ
 * changes under it — the form just learns, for example, that it was cancelled.
 *
 * The same shape as the message thread's feed: held open only while the tab is
 * visible (each open stream holds a function and a database poll server-side),
 * a catch-up refresh on return, and a slow poll whenever the stream is down.
 */
export function LiveRefresh({
  stream,
  fallbackMs = 30_000,
}: {
  stream: string;
  fallbackMs?: number;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  useEffect(() => {
    let source: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let pending: ReturnType<typeof setTimeout> | null = null;
    let caughtUp = false;

    // Coalesce a burst of events (several quotations at once) into one render.
    const refresh = () => {
      if (pending) return;
      pending = setTimeout(() => {
        pending = null;
        router.refresh();
        // Whatever changed usually raised a notification too; show it now.
        void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      }, 300);
    };
    const startPoll = () => {
      poll ??= setInterval(refresh, fallbackMs);
    };
    const stopPoll = () => {
      if (poll) clearInterval(poll);
      poll = null;
    };
    const open = () => {
      if (source) return;
      source = new EventSource(`/api/proxy${stream}`);
      source.onopen = stopPoll;
      // The browser reconnects by itself (or gives up on a 4xx); poll meanwhile.
      source.onerror = startPoll;
      source.onmessage = (event) => {
        // The first baseline after mount may already be newer than the page's own
        // render (a change between the two); later baselines (reconnects that
        // resumed from their last id) are not changes.
        const baseline = (JSON.parse(event.data) as { baseline?: boolean }).baseline === true;
        if (!baseline) refresh();
        else if (!caughtUp) {
          caughtUp = true;
          refresh();
        }
      };
    };
    const close = () => {
      source?.close();
      source = null;
      stopPoll();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        open();
        refresh();
      } else {
        close();
      }
    };

    if (document.visibilityState === "visible") open();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      close();
      if (pending) clearTimeout(pending);
    };
  }, [stream, fallbackMs, router, queryClient]);

  return null;
}
