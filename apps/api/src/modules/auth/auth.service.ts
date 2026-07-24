import { Injectable } from "@nestjs/common";
import type { AuthenticatedUser } from "@pharmachain/auth";
import type { RegisterInput } from "@pharmachain/core";
import { prisma } from "@pharmachain/db";
import { genericEventEmail, otpEmail, passwordResetEmail, welcomeEmail } from "@pharmachain/email";
import { notificationProviders, notify } from "@pharmachain/notifications";
import { recordAudit } from "../../common/audit";
import { ApiException, badRequest, conflict, forbidden, unauthorized } from "../../common/errors";
import { env } from "../../env";
import { generateOtpCode, hashOtp, hashToken, randomToken } from "../../lib/crypto";
import { hashPassword, verifyPassword } from "../../lib/password";
import { generateTotpSecret, otpauthUri, verifyTotp } from "../../lib/totp";
import { sendEmailTo } from "../shared/mailer";
import { issueOtp, verifyOtp } from "./otp";

const RESET_TTL_MS = 60 * 60 * 1000; // 60 minutes (US-206)

// Per-account lockout: after 5 consecutive failures within the window the
// account is refused before any credential check. DB-backed via LoginActivity,
// so it holds across instances and cannot be bypassed by rotating IPs.
const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_THRESHOLD = 5;

export interface LoginInput {
  email: string;
  password?: string;
  otp?: string;
  totpCode?: string;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  async buildAuthenticatedUser(userId: string): Promise<AuthenticatedUser> {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { membership: { include: { company: true } } },
    });
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      isSuperAdmin: user.isSuperAdmin,
      sessionVersion: user.sessionVersion,
      totpEnabled: Boolean(user.totpEnabledAt),
      preferredCurrency: user.preferredCurrency ?? null,
      membership: user.membership
        ? {
            companyId: user.membership.companyId,
            companyName: user.membership.company.name,
            companyType: user.membership.company.type,
            role: user.membership.role,
            verificationStatus: user.membership.company.verificationStatus,
            subscriptionTier: user.membership.company.subscriptionTier,
          }
        : null,
    };
  }

  // ─── Registration (US-101) ─────────────────────────────────────────────────

  async register(input: RegisterInput): Promise<{ companyId: string }> {
    const email = input.admin.email.toLowerCase();
    const [existingUser, existingCompany] = await Promise.all([
      prisma.user.findUnique({ where: { email } }),
      prisma.company.findUnique({
        where: { registrationNumber: input.company.registrationNumber },
      }),
    ]);
    if (existingUser) throw conflict("An account with this email already exists");
    if (existingCompany) throw conflict("A company with this registration number already exists");

    const passwordHash = await hashPassword(input.admin.password);
    const company = await prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: {
          name: input.company.name,
          type: input.company.type,
          country: input.company.country,
          address: input.company.address,
          registrationNumber: input.company.registrationNumber,
          primaryContactName: input.admin.name,
          primaryContactEmail: email,
          primaryContactPhone: input.company.contactPhone,
        },
      });
      const user = await tx.user.create({
        data: { email, name: input.admin.name, passwordHash, status: "ACTIVE" },
      });
      await tx.companyUserRole.create({
        data: { userId: user.id, companyId: company.id, role: "COMPANY_ADMIN" },
      });
      return company;
    });

    const admin = await prisma.user.findUniqueOrThrow({ where: { email } });
    await recordAudit(
      { id: admin.id, email },
      {
        action: "company.register",
        entityType: "Company",
        entityId: company.id,
        companyId: company.id,
      },
    );
    await sendEmailTo(email, welcomeEmail({ companyName: company.name, appUrl: env.APP_URL }));
    return { companyId: company.id };
  }

  // ─── Login (US-205/206 + OTP) ──────────────────────────────────────────────

  /** Consecutive failures since the last success, within the lockout window. */
  private async recentFailureCount(email: string): Promise<number> {
    const windowStart = new Date(Date.now() - LOCKOUT_WINDOW_MS);
    const lastSuccess = await prisma.loginActivity.findFirst({
      where: { email, success: true },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const since =
      lastSuccess && lastSuccess.createdAt > windowStart ? lastSuccess.createdAt : windowStart;
    return prisma.loginActivity.count({
      where: { email, success: false, createdAt: { gt: since } },
    });
  }

  async login(input: LoginInput): Promise<AuthenticatedUser> {
    const email = input.email.toLowerCase();
    const method = input.otp ? "OTP" : "PASSWORD";

    if ((await this.recentFailureCount(email)) >= LOCKOUT_THRESHOLD) {
      // Not recorded as another failure — the lock expires on its own.
      throw new ApiException(
        429,
        "RATE_LIMITED",
        "Too many failed sign-in attempts. Try again later or reset your password.",
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });

    let success = false;
    if (user && user.status === "ACTIVE") {
      if (input.password && user.passwordHash) {
        success = await verifyPassword(input.password, user.passwordHash);
      } else if (input.otp) {
        success = await verifyOtp(email, input.otp);
      }
    }

    // Second factor (deferred item: TOTP 2FA). The challenge response is not
    // a failed attempt — the password was right — so it is thrown before the
    // activity insert and never feeds the lockout counter. A WRONG code is a
    // real failure and counts.
    let totpFailed = false;
    if (success && user?.totpEnabledAt && user.totpSecret) {
      if (!input.totpCode) {
        throw new ApiException(
          401,
          "TOTP_REQUIRED",
          "Enter the 6-digit code from your authenticator app",
        );
      }
      if (!verifyTotp(user.totpSecret, input.totpCode)) {
        success = false;
        totpFailed = true;
      }
    }

    await prisma.loginActivity.create({
      data: {
        userId: user?.id,
        email,
        method,
        success,
        ip: input.ip || null,
        userAgent: input.userAgent || null,
      },
    });

    // Generic error — never reveal which factor failed (US-206). The TOTP
    // stage is only reachable with a correct password, so its message may be
    // specific.
    if (!success || !user) {
      throw unauthorized(totpFailed ? "Invalid verification code" : "Invalid email or password");
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return this.buildAuthenticatedUser(user.id);
  }

  async requestOtp(email: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    // No account enumeration: silently succeed for unknown/inactive users.
    if (user?.status !== "ACTIVE") return;
    const result = await issueOtp(email);
    if ("cooldown" in result) return; // silently absorb resend spam
    await sendEmailTo(user.email, otpEmail({ code: result.code }));
  }

  // ─── Password reset (US-206) ───────────────────────────────────────────────

  async forgotPassword(email: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (user?.status !== "ACTIVE" || !user.passwordHash) return;
    const token = randomToken();
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + RESET_TTL_MS),
      },
    });
    await sendEmailTo(
      user.email,
      passwordResetEmail({ url: `${env.APP_URL}/reset-password?token=${token}` }),
    );
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const row = await prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });
    if (!row || row.consumedAt || row.expiresAt < new Date()) {
      throw forbidden("This reset link is invalid or has expired — request a new one");
    }
    const passwordHash = await hashPassword(password);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: row.userId },
        // sessionVersion bump invalidates every active session (US-206)
        data: { passwordHash, sessionVersion: { increment: 1 } },
      }),
      prisma.passwordResetToken.update({
        where: { id: row.id },
        data: { consumedAt: new Date() },
      }),
      prisma.passwordResetToken.updateMany({
        where: { userId: row.userId, consumedAt: null, id: { not: row.id } },
        data: { consumedAt: new Date() },
      }),
    ]);
    await recordAudit(
      { id: row.userId, email: row.user.email },
      { action: "user.password-reset", entityType: "User", entityId: row.userId },
    );
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const ok = user.passwordHash && (await verifyPassword(currentPassword, user.passwordHash));
    if (!ok) throw forbidden("Current password is incorrect");
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(newPassword), sessionVersion: { increment: 1 } },
    });
  }

  // ─── Invitations (US-201) ──────────────────────────────────────────────────

  async acceptInvite(args: {
    token: string;
    name: string;
    password: string;
  }): Promise<AuthenticatedUser> {
    const invite = await prisma.invite.findUnique({
      where: { tokenHash: hashToken(args.token) },
      include: { company: true },
    });
    if (!invite || invite.revokedAt || invite.acceptedAt) {
      throw forbidden("This invitation is no longer valid — request a new one");
    }
    if (invite.expiresAt < new Date()) {
      throw forbidden("This invitation has expired — request a new one");
    }
    const email = invite.email.toLowerCase();
    const existing = await prisma.user.findUnique({
      where: { email },
      include: { membership: true },
    });
    if (existing?.membership) {
      throw conflict("This email is already active in another company");
    }

    const passwordHash = await hashPassword(args.password);
    const user = await prisma.$transaction(async (tx) => {
      const user = existing
        ? await tx.user.update({
            where: { id: existing.id },
            data: { name: args.name, passwordHash, status: "ACTIVE" },
          })
        : await tx.user.create({
            data: { email, name: args.name, passwordHash, status: "ACTIVE" },
          });
      await tx.companyUserRole.create({
        data: { userId: user.id, companyId: invite.companyId, role: invite.role },
      });
      await tx.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
      return user;
    });

    await recordAudit(
      { id: user.id, email },
      {
        action: "invite.accept",
        entityType: "User",
        entityId: user.id,
        companyId: invite.companyId,
      },
    );
    return this.buildAuthenticatedUser(user.id);
  }

  // ─── GDPR (US-1003) ────────────────────────────────────────────────────────

  async exportOwnData(userId: string): Promise<unknown> {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        membership: { include: { company: { select: { id: true, name: true } } } },
        notificationPreferences: true,
      },
    });
    const EXPORT_WINDOW = 500;
    const [notifications, notificationTotal, loginActivity, loginActivityTotal, messages] =
      await Promise.all([
        prisma.notification.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: EXPORT_WINDOW,
        }),
        prisma.notification.count({ where: { userId } }),
        prisma.loginActivity.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: EXPORT_WINDOW,
        }),
        prisma.loginActivity.count({ where: { userId } }),
        prisma.message.count({ where: { senderId: userId } }),
      ]);
    return {
      exportedAt: new Date().toISOString(),
      profile: {
        id: user.id,
        email: user.email,
        name: user.name,
        whatsappNumber: user.whatsappNumber,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
      },
      membership: user.membership,
      notificationPreferences: user.notificationPreferences,
      // A truncated export must say so (GDPR completeness).
      notifications,
      notificationTotal,
      notificationsTruncated: notificationTotal > notifications.length,
      loginActivity,
      loginActivityTotal,
      loginActivityTruncated: loginActivityTotal > loginActivity.length,
      authoredMessagesCount: messages,
    };
  }

  async requestDeletion(userId: string): Promise<void> {
    const pending = await prisma.dataDeletionRequest.findFirst({
      where: { userId, status: "PENDING" },
    });
    if (pending) throw conflict("A deletion request is already pending for this account");
    const request = await prisma.dataDeletionRequest.create({ data: { userId } });
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const superAdmins = await prisma.user.findMany({
      where: { isSuperAdmin: true, status: "ACTIVE" },
      select: { id: true },
    });
    await notify({
      userIds: superAdmins.map((u) => u.id),
      type: "DATA_REQUEST",
      title: "Data deletion requested",
      body: `${user.email} requested account deletion (GDPR). Review it in the admin panel.`,
      href: "/admin/data-requests",
      emailContent: genericEventEmail({
        title: "Data deletion requested",
        body: `${user.email} requested account deletion. SLA: 30 days.`,
        url: `${env.APP_URL}/admin/data-requests`,
      }),
    });
    await recordAudit(
      { id: userId, email: user.email },
      {
        action: "user.deletion-requested",
        entityType: "DataDeletionRequest",
        entityId: request.id,
      },
    );
  }

  // ─── TOTP second factor (deferred item) ────────────────────────────────────

  async setupTotp(userId: string): Promise<{ secret: string; otpauth: string }> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.totpEnabledAt) throw conflict("Two-factor authentication is already enabled");
    const secret = generateTotpSecret();
    // Pending until enableTotp proves the authenticator produces valid codes.
    await prisma.user.update({ where: { id: userId }, data: { totpSecret: secret } });
    return { secret, otpauth: otpauthUri(secret, user.email) };
  }

  async enableTotp(userId: string, code: string): Promise<void> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.totpEnabledAt) throw conflict("Two-factor authentication is already enabled");
    if (!user.totpSecret) throw badRequest("Start setup first");
    if (!verifyTotp(user.totpSecret, code)) throw badRequest("That code doesn't match — try again");
    await prisma.user.update({ where: { id: userId }, data: { totpEnabledAt: new Date() } });
  }

  async disableTotp(userId: string, password: string, code: string): Promise<void> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.totpEnabledAt || !user.totpSecret) {
      throw badRequest("Two-factor authentication is not enabled");
    }
    // Both factors again: a hijacked session alone must not be able to strip 2FA.
    if (!user.passwordHash || !(await verifyPassword(password, user.passwordHash))) {
      throw unauthorized("Invalid password");
    }
    if (!verifyTotp(user.totpSecret, code)) throw unauthorized("Invalid verification code");
    await prisma.user.update({
      where: { id: userId },
      data: { totpSecret: null, totpEnabledAt: null },
    });
  }

  async setWhatsappNumber(userId: string, number: string): Promise<void> {
    // US-604: saving a number starts a challenge — a 6-digit code sent over
    // the WhatsApp channel itself. The number counts as verified only after
    // verifyWhatsappNumber() checks the code, so notifications never go to a
    // number nobody proved they hold.
    const code = generateOtpCode();
    await prisma.user.update({
      where: { id: userId },
      data: {
        whatsappNumber: number,
        whatsappVerifiedAt: null,
        whatsappVerifyCodeHash: hashOtp(code, number, env.AUTH_SECRET),
        whatsappVerifyExpiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });
    try {
      await notificationProviders().whatsapp.send(
        number,
        `PharmaChain verification code: ${code}. It expires in 10 minutes.`,
      );
    } catch (err) {
      // The console provider never throws; a real provider failure leaves the
      // challenge in place — the user can re-save the number to retry.
      console.error("[whatsapp-verify] challenge delivery failed:", err);
    }
  }

  async verifyWhatsappNumber(userId: string, code: string): Promise<void> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.whatsappNumber || !user.whatsappVerifyCodeHash || !user.whatsappVerifyExpiresAt) {
      throw badRequest("No verification in progress — save your number first");
    }
    if (user.whatsappVerifyExpiresAt < new Date()) {
      throw badRequest("The code expired — save your number again for a fresh one");
    }
    if (hashOtp(code, user.whatsappNumber, env.AUTH_SECRET) !== user.whatsappVerifyCodeHash) {
      throw badRequest("That code doesn't match");
    }
    await prisma.user.update({
      where: { id: userId },
      data: {
        whatsappVerifiedAt: new Date(),
        whatsappVerifyCodeHash: null,
        whatsappVerifyExpiresAt: null,
      },
    });
  }
}
