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

/** How long the retry job leaves a freshly recorded message alone, so it
 *  does not race the immediate attempt deferred right after the request. */
const FIRST_ATTEMPT_GRACE_MS = 2 * 60_000;

export interface OutboxMessage {
  channel: OutboxChannel;
  recipient: string;
  payload: EmailContent | { text: string };
}

interface OutboxRow {
  id: string;
  channel: string;
  recipient: string;
  payload: unknown;
  attempts: number;
}

/**
 * Records messages BEFORE any delivery is attempted. notify() used to send
 * inline and write the outbox only on failure, so a serverless function
 * frozen or killed mid-send lost the message outright; now the row exists
 * first, and whatever the immediate attempt fails to finish, the retry job
 * finds. One round trip for the whole batch.
 */
export async function recordOutbox(
  messages: OutboxMessage[],
  now = new Date(),
): Promise<OutboxRow[]> {
  if (messages.length === 0) return [];
  return prisma.notificationOutbox.createManyAndReturn({
    data: messages.map((m) => ({
      channel: m.channel,
      recipient: m.recipient,
      payload: m.payload as object,
      attempts: 0,
      nextAttemptAt: new Date(now.getTime() + FIRST_ATTEMPT_GRACE_MS),
    })),
    select: { id: true, channel: true, recipient: true, payload: true, attempts: true },
  });
}

/** One delivery attempt for one row: sent on success, rescheduled with
 *  backoff on failure (a row past MAX_ATTEMPTS stays as the dead letter). */
async function attemptDelivery(
  row: OutboxRow,
  providers: { email: EmailProvider; whatsapp: WhatsAppProvider },
): Promise<boolean> {
  try {
    if (row.channel === "EMAIL") {
      const content = row.payload as EmailContent;
      await providers.email.send({ to: row.recipient, ...content });
    } else {
      const { text } = row.payload as { text: string };
      await providers.whatsapp.send(row.recipient, text);
    }
    await prisma.notificationOutbox.update({
      where: { id: row.id },
      data: { sentAt: new Date() },
    });
    return true;
  } catch (err) {
    const attempts = row.attempts + 1;
    await prisma.notificationOutbox
      .update({
        where: { id: row.id },
        data: {
          attempts,
          nextAttemptAt: backoff(attempts, new Date()),
          lastError: String(err).slice(0, 500),
        },
      })
      .catch((updateErr) => console.error("[outbox] reschedule failed:", updateErr));
    return false;
  }
}

/** Immediate delivery of freshly recorded rows, in parallel — run deferred
 *  (after the response), never in the request path. */
export async function deliverOutbox(
  rows: OutboxRow[],
  providers: { email: EmailProvider; whatsapp: WhatsAppProvider },
): Promise<void> {
  await Promise.allSettled(rows.map((row) => attemptDelivery(row, providers)));
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
    if (await attemptDelivery(row, providers)) delivered += 1;
    else if (row.attempts + 1 >= MAX_ATTEMPTS) deadLettered += 1;
  }
  return { retried: due.length, delivered, deadLettered };
}

/** Sent messages are kept for a month as delivery evidence, then dropped —
 *  every email now passes through the outbox, so it would otherwise grow
 *  without bound. Dead letters (never sent) are kept for operators. */
export async function pruneSentOutbox(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const result = await prisma.notificationOutbox.deleteMany({
    where: { sentAt: { lt: cutoff } },
  });
  return result.count;
}
