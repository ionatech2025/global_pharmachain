import { Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { runRegisteredJob } from "./registry";

/**
 * @Cron host for environments with a resident process (JOBS_IN_PROCESS=true:
 * the dedicated worker or local dev). Serverless production is driven by the
 * HTTP dispatcher instead — both hosts share the registry, its advisory
 * locks and its heartbeats, so running both concurrently is safe.
 */
@Injectable()
export class JobsService {
  @Cron("*/15 * * * *", { timeZone: "UTC" })
  rfqAutoClose(): Promise<unknown> {
    return runRegisteredJob("rfq-auto-close");
  }

  @Cron("*/15 * * * *", { timeZone: "UTC" })
  quotationExpiry(): Promise<unknown> {
    return runRegisteredJob("quotation-expiry");
  }

  @Cron("*/10 * * * *", { timeZone: "UTC" })
  outboxRetry(): Promise<unknown> {
    return runRegisteredJob("outbox-retry");
  }

  @Cron("*/10 * * * *", { timeZone: "UTC" })
  webhookRetry(): Promise<unknown> {
    return runRegisteredJob("webhook-retry");
  }

  @Cron("0 * * * *", { timeZone: "UTC" })
  tokenCleanup(): Promise<unknown> {
    return runRegisteredJob("token-cleanup");
  }

  @Cron("0 5 * * *", { timeZone: "UTC" })
  documentExpiry(): Promise<unknown> {
    return runRegisteredJob("document-expiry");
  }

  @Cron("30 4 * * *", { timeZone: "UTC" })
  uploadCleanup(): Promise<unknown> {
    return runRegisteredJob("upload-cleanup");
  }

  @Cron("45 4 * * *", { timeZone: "UTC" })
  throttleCleanup(): Promise<unknown> {
    return runRegisteredJob("throttle-cleanup");
  }

  @Cron("15 5 * * *", { timeZone: "UTC" })
  dsrSla(): Promise<unknown> {
    return runRegisteredJob("dsr-sla");
  }

  @Cron("0 6 * * *", { timeZone: "UTC" })
  savedSearchAlerts(): Promise<unknown> {
    return runRegisteredJob("saved-search-alerts");
  }

  @Cron("30 6 * * *", { timeZone: "UTC" })
  logisticsAlerts(): Promise<unknown> {
    return runRegisteredJob("logistics-alerts");
  }

  @Cron("10 4 * * *", { timeZone: "UTC" })
  fxRefresh(): Promise<unknown> {
    return runRegisteredJob("fx-refresh");
  }

  @Cron("0 7 * * *", { timeZone: "UTC" })
  scheduledReports(): Promise<unknown> {
    return runRegisteredJob("scheduled-reports");
  }

  @Cron("20 5 * * *", { timeZone: "UTC" })
  trustBadges(): Promise<unknown> {
    return runRegisteredJob("trust-badges");
  }
}
