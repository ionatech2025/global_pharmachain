import { waitUntil } from "@vercel/functions";

/**
 * Post-response async work, serverless-safe (P0 remediation). On Vercel the
 * invocation may be frozen the moment the response settles, so anything
 * fire-and-forget must be registered with waitUntil() to be guaranteed to
 * run. Outside a Vercel request context (the cron worker, local dev, tests)
 * waitUntil throws — there a detached promise is genuinely fine, so we fall
 * back to it.
 */
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
