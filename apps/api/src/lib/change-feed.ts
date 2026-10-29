import type { MessageEvent } from "@nestjs/common";
import { Observable } from "rxjs";

/**
 * A server-sent change feed: emits a bare "changed" event whenever the
 * fingerprint of what the viewer is looking at moves. The client refetches on
 * the event through its normal read path, so there is one payload shape, the
 * stream itself never carries data, and a reconnect (EventSource sends the
 * last event id) catches up at once if anything moved while it was away.
 *
 * A fresh connection announces its baseline as an event too ({baseline:true}).
 * Without it the browser held no id until the first change, so every ~55 s
 * reconnect re-baselined blind and a change landing in that gap was lost; and
 * nothing told the page that its own render might already be older than the
 * baseline. The client refreshes once on its first baseline to close that.
 *
 * Polling a fingerprint rather than pushing from writers is deliberate: the API
 * runs as serverless functions with no shared memory or broker between them,
 * and Neon's pooled connections cannot hold LISTEN. A cheap indexed read every
 * few seconds per open, visible tab is the honest cost. Streams end after
 * ~55 s — inside every function duration limit — and the browser reconnects.
 */
export function changeFeed(
  fingerprint: () => Promise<string>,
  lastEventId: string | undefined,
  options: { intervalMs?: number; lifetimeMs?: number } = {},
): Observable<MessageEvent> {
  const { intervalMs = 3000, lifetimeMs = 55_000 } = options;
  return new Observable<MessageEvent>((subscriber) => {
    let last = lastEventId;
    let stopped = false;
    const tick = async () => {
      try {
        const current = await fingerprint();
        if (stopped) return;
        if (last === undefined) {
          last = current;
          subscriber.next({ id: current, data: { baseline: true } } as MessageEvent);
        } else if (current !== last) {
          last = current;
          subscriber.next({ id: current, data: { changed: true } } as MessageEvent);
        }
      } catch {
        // A transient read failure skips this tick; the next one retries.
      }
    };
    void tick();
    const interval = setInterval(tick, intervalMs);
    const end = setTimeout(() => subscriber.complete(), lifetimeMs);
    return () => {
      stopped = true;
      clearInterval(interval);
      clearTimeout(end);
    };
  });
}
