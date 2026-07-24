import { waitUntil } from "@vercel/functions";

/** Serverless-safe fire-and-forget: registered with waitUntil on Vercel so
 *  the invocation isn't frozen mid-delivery; detached elsewhere (worker). */
export function defer(work: Promise<unknown>): void {
  const guarded = work.catch((err) => {
    console.error("[defer] background task failed:", err);
  });
  try {
    waitUntil(guarded);
  } catch {
    void guarded;
  }
}
