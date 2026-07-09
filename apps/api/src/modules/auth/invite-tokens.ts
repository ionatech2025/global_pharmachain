import { inviteEmail } from "@pharmachain/email";
import { env } from "../../env";
import { hashToken, randomToken } from "../../lib/crypto";

export const INVITE_TTL_MS = 72 * 60 * 60 * 1000; // 72 hours (US-201)

export function createInviteToken(): { token: string; tokenHash: string; expiresAt: Date } {
  const token = randomToken();
  return { token, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + INVITE_TTL_MS) };
}

export function inviteEmailContent(companyName: string, roleLabel: string, token: string) {
  return inviteEmail({
    companyName,
    roleLabel,
    url: `${env.APP_URL}/invite?token=${token}`,
  });
}
