import { prisma } from "@pharmachain/db";
import { logger } from "../lib/logger";
import { runDocumentExpiryJob } from "./document-expiry";
import {
  runDsrSlaJob,
  runFxRefreshJob,
  runLogisticsAlertsJob,
  runOutboxJob,
  runQuotationExpiryJob,
  runRfqAutoCloseJob,
  runSavedSearchAlertJob,
  runScheduledReportsJob,
  runThrottleCleanupJob,
  runTokenCleanupJob,
  runTrustBadgeJob,
  runUploadCleanupJob,
  runWebhookRetryJob,
} from "./housekeeping";
import { withJobLock } from "./lock";

/**
 * Single source of truth for scheduled work (P0 remediation, review finding
 * 01). Two execution hosts share it:
 *  - the HTTP dispatcher (jobs.controller), driven by GitHub Actions cron
 *    workflows against the serverless deployment, and
 *  - the @Cron worker (jobs.service) when JOBS_IN_PROCESS=true.
 * Every run — from either host — takes the advisory lock and writes a
 * JobHeartbeat row, so freshness is observable and double-running is
 * impossible across hosts.
 */

export type JobTier = "frequent" | "daily";

const JOBS: Record<string, { tier: JobTier; run: () => Promise<void> }> = {
  "rfq-auto-close": { tier: "frequent", run: () => runRfqAutoCloseJob() },
  "quotation-expiry": { tier: "frequent", run: () => runQuotationExpiryJob() },
  "outbox-retry": { tier: "frequent", run: () => runOutboxJob() },
  "webhook-retry": { tier: "frequent", run: () => runWebhookRetryJob() },
  "token-cleanup": { tier: "frequent", run: () => runTokenCleanupJob() },
  "document-expiry": { tier: "daily", run: () => runDocumentExpiryJob() },
  "upload-cleanup": { tier: "daily", run: () => runUploadCleanupJob() },
  "throttle-cleanup": { tier: "daily", run: () => runThrottleCleanupJob() },
  "dsr-sla": { tier: "daily", run: () => runDsrSlaJob() },
  "saved-search-alerts": { tier: "daily", run: () => runSavedSearchAlertJob() },
  "logistics-alerts": { tier: "daily", run: () => runLogisticsAlertsJob() },
  "fx-refresh": { tier: "daily", run: () => runFxRefreshJob() },
  "scheduled-reports": { tier: "daily", run: () => runScheduledReportsJob() },
  "trust-badges": { tier: "daily", run: () => runTrustBadgeJob() },
};

export function jobNames(tier?: JobTier): string[] {
  return Object.entries(JOBS)
    .filter(([, def]) => !tier || def.tier === tier)
    .map(([name]) => name);
}

export interface JobRunResult {
  name: string;
  ok: boolean;
  skipped: boolean;
  ms: number;
  error?: string;
}

/** Lock + heartbeat wrapper shared by both hosts. */
export async function runRegisteredJob(name: string): Promise<JobRunResult> {
  const def = JOBS[name];
  if (!def) return { name, ok: false, skipped: false, ms: 0, error: "unknown job" };
  const started = Date.now();
  await prisma.jobHeartbeat
    .upsert({
      where: { name },
      update: { lastRunAt: new Date() },
      create: { name, lastRunAt: new Date() },
    })
    .catch(() => {});
  try {
    const ran = await withJobLock(`job:${name}`, def.run);
    const ms = Date.now() - started;
    if (!ran) {
      logger.info(`job ${name} skipped — another instance holds the lock`);
      return { name, ok: true, skipped: true, ms };
    }
    await prisma.jobHeartbeat
      .update({
        where: { name },
        data: { lastOkAt: new Date(), lastError: null, durationMs: ms },
      })
      .catch(() => {});
    return { name, ok: true, skipped: false, ms };
  } catch (err) {
    const ms = Date.now() - started;
    const message = String(err).slice(0, 500);
    logger.error(`job ${name} failed`, { error: message });
    await prisma.jobHeartbeat
      .update({ where: { name }, data: { lastError: message, durationMs: ms } })
      .catch(() => {});
    return { name, ok: false, skipped: false, ms, error: message };
  }
}
