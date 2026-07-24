import { Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
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
} from "./housekeeping";
import { withJobLock } from "./lock";

/** Advisory-locked so only one instance runs a given sweep (see lock.ts). */
async function guarded(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    const ran = await withJobLock(`job:${name}`, fn);
    if (!ran) logger.info(`job ${name} skipped — another instance holds the lock`);
  } catch (err) {
    logger.error(`job ${name} failed`, { error: String(err) });
  }
}

/** Scheduled jobs (all UTC). Runs inside the API when JOBS_IN_PROCESS=true,
 *  or in the dedicated worker (src/jobs/worker.ts). */
@Injectable()
export class JobsService {
  @Cron("0 5 * * *", { timeZone: "UTC" })
  documentExpiry(): Promise<void> {
    return guarded("document-expiry", () => runDocumentExpiryJob());
  }

  @Cron("*/15 * * * *", { timeZone: "UTC" })
  rfqAutoClose(): Promise<void> {
    return guarded("rfq-auto-close", () => runRfqAutoCloseJob());
  }

  @Cron("*/15 * * * *", { timeZone: "UTC" })
  quotationExpiry(): Promise<void> {
    return guarded("quotation-expiry", () => runQuotationExpiryJob());
  }

  @Cron("0 * * * *", { timeZone: "UTC" })
  tokenCleanup(): Promise<void> {
    return guarded("token-cleanup", () => runTokenCleanupJob());
  }

  @Cron("30 4 * * *", { timeZone: "UTC" })
  uploadCleanup(): Promise<void> {
    return guarded("upload-cleanup", () => runUploadCleanupJob());
  }

  @Cron("45 4 * * *", { timeZone: "UTC" })
  throttleCleanup(): Promise<void> {
    return guarded("throttle-cleanup", () => runThrottleCleanupJob());
  }

  @Cron("15 5 * * *", { timeZone: "UTC" })
  dsrSla(): Promise<void> {
    return guarded("dsr-sla", () => runDsrSlaJob());
  }

  @Cron("*/10 * * * *", { timeZone: "UTC" })
  outboxRetry(): Promise<void> {
    return guarded("outbox-retry", () => runOutboxJob());
  }

  @Cron("0 6 * * *", { timeZone: "UTC" })
  savedSearchAlerts(): Promise<void> {
    return guarded("saved-search-alerts", () => runSavedSearchAlertJob());
  }

  @Cron("30 6 * * *", { timeZone: "UTC" })
  logisticsAlerts(): Promise<void> {
    return guarded("logistics-alerts", () => runLogisticsAlertsJob());
  }

  @Cron("10 4 * * *", { timeZone: "UTC" })
  fxRefresh(): Promise<void> {
    return guarded("fx-refresh", () => runFxRefreshJob());
  }

  @Cron("0 7 * * *", { timeZone: "UTC" })
  scheduledReports(): Promise<void> {
    return guarded("scheduled-reports", () => runScheduledReportsJob());
  }

  @Cron("20 5 * * *", { timeZone: "UTC" })
  trustBadges(): Promise<void> {
    return guarded("trust-badges", () => runTrustBadgeJob());
  }
}
