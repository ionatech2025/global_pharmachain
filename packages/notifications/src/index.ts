import type { NotificationType, PreferenceEventType } from "@pharmachain/core";
import { PREFERENCE_EVENT_TYPES } from "@pharmachain/core";
import type { CompanyRole } from "@pharmachain/db";
import { prisma } from "@pharmachain/db";
import {
  createEmailProvider,
  type EmailContent,
  type EmailProvider,
  emailConfigFromEnv,
} from "@pharmachain/email";
import { defer } from "./defer";
import { deliverOutbox, type OutboxMessage, recordOutbox } from "./outbox";
import { sendWebPush, vapidPublicKey } from "./webpush";
import { createWhatsAppProvider, type WhatsAppProvider } from "./whatsapp";

export * from "./outbox";
export * from "./webpush";
export * from "./whatsapp";

let emailProvider: EmailProvider | undefined;
let whatsappProvider: WhatsAppProvider | undefined;

function email(): EmailProvider {
  emailProvider ??= createEmailProvider(emailConfigFromEnv());
  return emailProvider;
}

function whatsapp(): WhatsAppProvider {
  whatsappProvider ??= createWhatsAppProvider(process.env.WHATSAPP_PROVIDER);
  return whatsappProvider;
}

export interface NotifyInput {
  /** Explicit recipients… */
  userIds?: string[];
  /** …or all ACTIVE members of a company (optionally filtered by role). */
  companyId?: string;
  roles?: CompanyRole[];
  type: NotificationType;
  title: string;
  body: string;
  /** In-app deep link, e.g. /rfqs/123 */
  href?: string;
  /** Optional email content; sent per recipient subject to preferences. */
  emailContent?: EmailContent;
  /** Optional WhatsApp text; sent subject to preferences + verified number. */
  whatsappText?: string;
}

function isPreferenceEvent(type: NotificationType): type is PreferenceEventType {
  return (PREFERENCE_EVENT_TYPES as readonly string[]).includes(type);
}

/**
 * Fan a business event out to in-app notifications (always), email and
 * WhatsApp (opt-out per event type, US-606).
 *
 * Delivery is best-effort end to end: notify() NEVER throws. Callers invoke
 * it after their business transaction has committed, so a notification
 * failure must not turn an already-succeeded mutation into a 5xx (e.g. an
 * order that was created but whose award email hiccuped). Failures are
 * logged for the collector to alert on.
 */
export async function notify(input: NotifyInput): Promise<void> {
  try {
    await fanout(input);
  } catch (err) {
    console.error(`[notify] fanout failed for ${input.type}:`, err);
  }
}

async function fanout(input: NotifyInput): Promise<void> {
  let userIds = input.userIds ?? [];
  if (input.companyId) {
    const members = await prisma.companyUserRole.findMany({
      where: {
        companyId: input.companyId,
        ...(input.roles ? { role: { in: input.roles } } : {}),
        user: { status: "ACTIVE" },
      },
      select: { userId: true },
    });
    userIds = [...new Set([...userIds, ...members.map((m) => m.userId)])];
  }
  if (userIds.length === 0) return;

  await prisma.notification.createMany({
    data: userIds.map((userId) => ({
      userId,
      type: input.type,
      title: input.title,
      body: input.body,
      href: input.href,
    })),
  });

  // Phase 4 §1: Web Push rides along with every in-app notification (subject
  // to the same per-event email preference — push is an off-platform channel).
  if (vapidPublicKey()) {
    // waitUntil-registered: a serverless invocation may freeze right after
    // the response — detached promises would silently lose pushes (P0 fix).
    defer(pushFanout(userIds, input));
  }

  if (!input.emailContent && !input.whatsappText) return;

  const users = await prisma.user.findMany({
    where: { id: { in: userIds }, status: "ACTIVE" },
    select: { id: true, email: true, whatsappNumber: true, whatsappVerifiedAt: true },
  });
  const prefs = isPreferenceEvent(input.type)
    ? await prisma.notificationPreference.findMany({
        where: { userId: { in: userIds }, eventType: input.type },
      })
    : [];
  const prefByUser = new Map(prefs.map((p) => [p.userId, p]));

  const messages: OutboxMessage[] = [];
  for (const user of users) {
    const pref = prefByUser.get(user.id);
    const emailEnabled = pref?.email ?? true; // default all-on (opt-out model)
    const whatsappEnabled = pref?.whatsapp ?? true;
    if (input.emailContent && emailEnabled) {
      messages.push({ channel: "EMAIL", recipient: user.email, payload: input.emailContent });
    }
    // US-604: silent fallback — WhatsApp only for verified numbers, and a
    // provider failure never surfaces to the user (email/in-app already sent).
    if (input.whatsappText && whatsappEnabled && user.whatsappNumber && user.whatsappVerifiedAt) {
      messages.push({
        channel: "WHATSAPP",
        recipient: user.whatsappNumber,
        payload: { text: input.whatsappText },
      });
    }
  }

  // Off-platform delivery never runs in the request path any more. Each
  // message is recorded first (one insert for the batch), then delivered
  // after the response — previously the caller waited on an SMTP handshake
  // per recipient (accepting a quotation mailed every losing supplier inline).
  // A message the deferred attempt cannot finish is picked up by the outbox
  // retry job.
  const rows = await recordOutbox(messages);
  if (rows.length > 0) defer(deliverOutbox(rows, notificationProviders()));
}

/** Push delivery to every registered device; dead endpoints are pruned. */
async function pushFanout(userIds: string[], input: NotifyInput): Promise<void> {
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId: { in: userIds } },
  });
  if (subscriptions.length === 0) return;
  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        const result = await sendWebPush(sub, {
          title: input.title,
          body: input.body,
          href: input.href ?? "/notifications",
        });
        if (result.gone) {
          await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        }
      } catch (err) {
        console.error(`[notify] push delivery failed for ${sub.id}:`, err);
      }
    }),
  );
}

/** Providers as configured by env — used by the outbox retry job. */
export function notificationProviders(): { email: EmailProvider; whatsapp: WhatsAppProvider } {
  return { email: email(), whatsapp: whatsapp() };
}
