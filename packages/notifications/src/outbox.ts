import { prisma } from "@pharmachain/db";
import type { EmailContent, EmailProvider } from "@pharmachain/email";
import type { WhatsAppProvider } from "./whatsapp";

const MAX_ATTEMPTS = 6;

/** attempts² × 5 min, capped at 4 h: 5m, 20m, 45m, 80m, 125m → dead-letter. */
function backoff(attempts: number, from: Date): Date {
  const minutes = Math.min(attempts * attempts * 5, 240);
  return new Date(from.getTime() + minutes * 60_000);
}

export type OutboxChannel = "EMAIL" | "WHATSAPP";

/**
 * Captures a failed delivery for retry. Best-effort itself — if the outbox
 * write fails too, the original error is already logged and there is nothing
 * further to do without risking the caller.
 */
export async function enqueueOutbox(
  channel: OutboxChannel,
  recipient: string,
  payload: EmailContent | { text: string },
  error: unknown,
  now = new Date(),
): Promise<void> {
  try {
    await prisma.notificationOutbox.create({
      data: {
        channel,
        recipient,
        payload: payload as object,
        attempts: 1,
        nextAttemptAt: backoff(1, now),
        lastError: String(error).slice(0, 500),
      },
    });
  } catch (err) {
    console.error("[outbox] enqueue failed:", err);
  }
}

/**
 * Retries due outbox rows. Rows that exhaust MAX_ATTEMPTS stay unsent with
 * their lastError as the dead-letter record (visible to operators via SQL /
 * future admin surface); the job logs a summary either way.
 */
export async function runOutboxRetryJob(
  providers: { email: EmailProvider; whatsapp: WhatsAppProvider },
  now = new Date(),
): Promise<{ retried: number; delivered: number; deadLettered: number }> {
  const due = await prisma.notificationOutbox.findMany({
    where: { sentAt: null, nextAttemptAt: { lte: now }, attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { nextAttemptAt: "asc" },
    take: 100,
  });
  let delivered = 0;
  let deadLettered = 0;
  for (const row of due) {
    try {
      if (row.channel === "EMAIL") {
        const content = row.payload as unknown as EmailContent;
        await providers.email.send({ to: row.recipient, ...content });
      } else {
        const { text } = row.payload as unknown as { text: string };
        await providers.whatsapp.send(row.recipient, text);
      }
      await prisma.notificationOutbox.update({
        where: { id: row.id },
        data: { sentAt: new Date() },
      });
      delivered += 1;
    } catch (err) {
      const attempts = row.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) deadLettered += 1;
      await prisma.notificationOutbox.update({
        where: { id: row.id },
        data: {
          attempts,
          nextAttemptAt: backoff(attempts, new Date()),
          lastError: String(err).slice(0, 500),
        },
      });
    }
  }
  return { retried: due.length, delivered, deadLettered };
}
