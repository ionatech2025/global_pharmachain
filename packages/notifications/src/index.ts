import type { NotificationType, PreferenceEventType } from "@pharmachain/core";
import { PREFERENCE_EVENT_TYPES } from "@pharmachain/core";
import type { CompanyRole } from "@pharmachain/db";
import { prisma } from "@pharmachain/db";
import { createEmailProvider, type EmailContent, type EmailProvider } from "@pharmachain/email";
import { createWhatsAppProvider, type WhatsAppProvider } from "./whatsapp";

export * from "./whatsapp";

let emailProvider: EmailProvider | undefined;
let whatsappProvider: WhatsAppProvider | undefined;

function email(): EmailProvider {
  emailProvider ??= createEmailProvider({
    provider: process.env.EMAIL_PROVIDER === "resend" ? "resend" : "console",
    from: process.env.EMAIL_FROM ?? "PharmaChain <no-reply@pharmachain.local>",
    resendApiKey: process.env.RESEND_API_KEY,
  });
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
 * WhatsApp (opt-out per event type, US-606). External sends are best-effort:
 * failures are logged, never thrown into the calling mutation.
 */
export async function notify(input: NotifyInput): Promise<void> {
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

  await Promise.all(
    users.map(async (user) => {
      const pref = prefByUser.get(user.id);
      const emailEnabled = pref?.email ?? true; // default all-on (opt-out model)
      const whatsappEnabled = pref?.whatsapp ?? true;

      if (input.emailContent && emailEnabled) {
        try {
          await email().send({ to: user.email, ...input.emailContent });
        } catch (err) {
          console.error(`[notify] email delivery failed for user ${user.id}:`, err);
        }
      }
      // US-604: silent fallback — WhatsApp only for verified numbers, and a
      // provider failure never surfaces to the user (email/in-app already sent).
      if (input.whatsappText && whatsappEnabled && user.whatsappNumber && user.whatsappVerifiedAt) {
        try {
          await whatsapp().send(user.whatsappNumber, input.whatsappText);
        } catch (err) {
          console.error(`[notify] whatsapp delivery failed for user ${user.id}:`, err);
        }
      }
    }),
  );
}
