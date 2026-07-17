import { prisma } from "@pharmachain/db";
import { env } from "../../env";
import { generateOtpCode, hashOtp } from "../../lib/crypto";

const OTP_TTL_MS = 10 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

export type OtpRequestResult = { ok: true } | { ok: false; reason: "cooldown" };

/** Issues a 6-digit code (10-minute TTL, 60s resend cooldown) and returns it
 *  for delivery. Only the peppered hash is stored. */
export async function issueOtp(email: string): Promise<{ code: string } | { cooldown: true }> {
  const normalized = email.toLowerCase();
  const latest = await prisma.emailOtp.findFirst({
    where: { email: normalized, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (latest && Date.now() - latest.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    return { cooldown: true };
  }
  const code = generateOtpCode();
  await prisma.emailOtp.create({
    data: {
      email: normalized,
      codeHash: hashOtp(code, normalized, env.AUTH_SECRET),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });
  return { code };
}

/** Constant-shape verification: attempts are counted, codes are single-use. */
export async function verifyOtp(email: string, code: string): Promise<boolean> {
  const normalized = email.toLowerCase();
  const otp = await prisma.emailOtp.findFirst({
    where: { email: normalized, consumedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!otp) return false;
  if (otp.attempts >= MAX_ATTEMPTS) return false;

  const matches = otp.codeHash === hashOtp(code, normalized, env.AUTH_SECRET);
  if (!matches) {
    await prisma.emailOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
    return false;
  }
  // Atomic consume — under concurrent verification only one caller wins.
  const consumed = await prisma.emailOtp.updateMany({
    where: { id: otp.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  return consumed.count === 1;
}
