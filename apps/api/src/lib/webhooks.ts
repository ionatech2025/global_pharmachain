import { createHmac } from "node:crypto";
import type { WebhookEvent } from "@pharmachain/core";
import { type Prisma, prisma } from "@pharmachain/db";
import { defer } from "./defer";
import { logger } from "./logger";

/**
 * Partner webhooks (Phase 5 §3): durable signed push to external systems.
 * Emission enqueues a delivery row per matching endpoint; the delivery pass
 * (invoked inline right away and by the retry cron) POSTs with an HMAC
 * signature over `${timestamp}.${deliveryId}.${body}` — timestamp + unique
 * delivery id give consumers replay protection. Quadratic backoff, 6
 * attempts, dead-letter rows keep the last error.
 */

const MAX_ATTEMPTS = 6;
const TIMEOUT_MS = 10_000;

export async function emitWebhookEvent(
  companyIds: string[],
  event: WebhookEvent,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const hooks = await prisma.webhook.findMany({
      where: { companyId: { in: companyIds }, active: true, events: { has: event } },
      select: { id: true },
    });
    if (hooks.length === 0) return;
    await prisma.webhookDelivery.createMany({
      data: hooks.map((hook) => ({
        webhookId: hook.id,
        event,
        payload: {
          event,
          occurredAt: new Date().toISOString(),
          data: payload,
        } as unknown as Prisma.InputJsonValue,
      })),
    });
    // Immediate first attempt (waitUntil-registered); failures fall to
    // the retry job.
    defer(runWebhookDeliveryPass());
  } catch (err) {
    logger.error("webhook emit failed", { event, error: String(err) });
  }
}

export function signWebhookBody(secret: string, timestamp: string, id: string, body: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${id}.${body}`).digest("hex");
}

export async function runWebhookDeliveryPass(now = new Date()): Promise<{ delivered: number }> {
  const due = await prisma.webhookDelivery.findMany({
    where: { deliveredAt: null, nextAttemptAt: { lte: now }, attempts: { lt: MAX_ATTEMPTS } },
    include: { webhook: true },
    orderBy: { createdAt: "asc" },
    take: 50,
  });
  let delivered = 0;
  for (const delivery of due) {
    if (!delivery.webhook.active) continue;
    const body = JSON.stringify(delivery.payload);
    const timestamp = String(Math.floor(now.getTime() / 1000));
    const signature = signWebhookBody(delivery.webhook.secret, timestamp, delivery.id, body);
    let status = 0;
    let error: string | null = null;
    try {
      const res = await fetch(delivery.webhook.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-pharmachain-event": delivery.event,
          "x-pharmachain-delivery": delivery.id,
          "x-pharmachain-timestamp": timestamp,
          "x-pharmachain-signature": `v1=${signature}`,
        },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      status = res.status;
      if (!res.ok) error = `endpoint returned ${res.status}`;
    } catch (err) {
      error = String(err).slice(0, 300);
    }
    const attempts = delivery.attempts + 1;
    if (!error) {
      delivered += 1;
      await prisma.$transaction([
        prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: { deliveredAt: new Date(), attempts, lastStatus: status, lastError: null },
        }),
        prisma.webhook.update({
          where: { id: delivery.webhookId },
          data: { lastSuccessAt: new Date(), failCount: 0 },
        }),
      ]);
    } else {
      const backoffMinutes = Math.min(attempts * attempts * 5, 240);
      await prisma.$transaction([
        prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            attempts,
            lastStatus: status || null,
            lastError: error,
            nextAttemptAt: new Date(now.getTime() + backoffMinutes * 60_000),
          },
        }),
        prisma.webhook.update({
          where: { id: delivery.webhookId },
          data: { failCount: { increment: 1 } },
        }),
      ]);
    }
  }
  return { delivered };
}
