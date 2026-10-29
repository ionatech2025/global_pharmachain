import type { RfqStatus } from "./enums";

/** Where the platform operates; the zone a deadline is stated in when the
 *  reader's own is unknown (emails, WhatsApp, webhooks). */
export const PLATFORM_TIME_ZONE = "Africa/Kampala";

/**
 * A time as a procurement notice must state it (a deadline, a receipt): a specific date AND time
 * (UNCITRAL Model Law art. 30(1)), in a named zone, with UTC beside it so a
 * reader anywhere can convert it. A bare date was ambiguous by up to a day:
 * "23:59 UTC on the 5th" is already the 6th in Kampala.
 */
export function formatNoticeTime(at: Date, timeZone: string = PLATFORM_TIME_ZONE): string {
  const local = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
    timeZoneName: "short",
  }).format(at);
  const utc = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "UTC",
  }).format(at);
  return timeZone === "UTC" ? local : `${local} (${utc} UTC)`;
}

/**
 * The status a reader should act on. Closing an RFQ at its deadline is done by
 * a scheduled job, and scheduled jobs run late (GitHub documents delays under
 * load); until it runs the row still says OPEN. Every read uses this instead,
 * so "Open" is never shown, and quoting never offered, after the deadline.
 */
export function effectiveRfqStatus(status: RfqStatus, deadline: Date, now = new Date()): RfqStatus {
  return status === "OPEN" && deadline.getTime() <= now.getTime() ? "CLOSED" : status;
}
