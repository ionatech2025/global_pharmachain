import { createHmac } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
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

/**
 * SSRF guard (review finding, OWASP ASVS V12): webhook URLs are
 * user-supplied and fetched server-side, so every resolved address must be
 * publicly routable — private, loopback, link-local and metadata ranges are
 * rejected, redirects are never followed, and response bodies are never
 * read. Residual DNS-rebinding TOCTOU between this check and connect is
 * accepted and documented (mitigating it fully needs a pinned-IP dialer).
 */
function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const octets = address.split(".").map(Number) as [number, number, number, number];
    const [a, b] = octets;
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) || // CGNAT
      (a === 169 && b === 254) || // link-local / cloud metadata
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      a >= 224 // multicast + reserved
    );
  }
  const lower = address.toLowerCase();
  return (
    lower === "::" ||
    lower === "::1" ||
    lower.startsWith("fc") || // unique-local fc00::/7
    lower.startsWith("fd") ||
    lower.startsWith("fe8") || // link-local fe80::/10
    lower.startsWith("fe9") ||
    lower.startsWith("fea") ||
    lower.startsWith("feb") ||
    lower.startsWith("::ffff:") // v4-mapped — re-check the embedded v4
  );
}

export async function assertSafeWebhookUrl(rawUrl: string): Promise<void> {
  const url = new URL(rawUrl);
  if (url.protocol !== "https:") throw new Error("Webhook URLs must be https");
  if (url.username || url.password) throw new Error("Credentials in webhook URLs are not allowed");
  const host = url.hostname;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw new Error("Webhook host resolves to a private network");
  }
  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true }).catch(() => {
        throw new Error("Webhook host does not resolve");
      });
  for (const { address } of addresses) {
    const mapped = address.toLowerCase().startsWith("::ffff:") ? address.slice(7) : address;
    if (isPrivateAddress(mapped)) {
      throw new Error("Webhook host resolves to a private network");
    }
  }
}

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
      await assertSafeWebhookUrl(delivery.webhook.url);
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
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      status = res.status;
      // Never follow or read: a redirect is a misconfigured endpoint, and the
      // body of any response is untrusted — cancel it unread.
      await res.body?.cancel().catch(() => {});
      if (res.status >= 300 && res.status < 400) {
        error = `endpoint redirected (${res.status}) — redirects are not followed`;
      } else if (!res.ok) {
        error = `endpoint returned ${res.status}`;
      }
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
