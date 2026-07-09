export const EMAIL_THROTTLE_MS = 10 * 60 * 1000; // max 1 email/thread/10min (US-603)

export function shouldSendThreadEmail(lastEmailNotifiedAt: Date | null, now: Date): boolean {
  return !lastEmailNotifiedAt || now.getTime() - lastEmailNotifiedAt.getTime() >= EMAIL_THROTTLE_MS;
}
