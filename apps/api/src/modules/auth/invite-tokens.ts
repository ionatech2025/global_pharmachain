import { inviteEmail } from "@pharmachain/email";
import { env } from "../../env";
import { hashToken, randomToken } from "../../lib/crypto";
import { INVITE_TTL_MS } from "./invite-validity";

export * from "./invite-validity";

export function createInviteToken(): { token: string; tokenHash: string; expiresAt: Date } {
  const token = randomToken();
  return { token, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + INVITE_TTL_MS) };
}

export function inviteUrlFor(token: string): string {
  return `${env.APP_URL}/invite?token=${encodeURIComponent(token)}`;
}

export function inviteEmailContent(companyName: string, roleLabel: string, token: string) {
  return inviteEmail({
    companyName,
    roleLabel,
    url: inviteUrlFor(token),
  });
}
