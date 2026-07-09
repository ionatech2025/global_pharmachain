import { Injectable } from "@nestjs/common";
import type { AuthenticatedUser } from "@pharmachain/auth";
import type { RegisterInput } from "@pharmachain/core";
import { prisma } from "@pharmachain/db";
import { genericEventEmail, otpEmail, passwordResetEmail, welcomeEmail } from "@pharmachain/email";
import { notify } from "@pharmachain/notifications";
import { recordAudit } from "../../common/audit";
import { conflict, forbidden, unauthorized } from "../../common/errors";
import { env } from "../../env";
import { hashToken, randomToken } from "../../lib/crypto";
import { sendEmailTo } from "../shared/mailer";
import { issueOtp, verifyOtp } from "./otp";

const RESET_TTL_MS = 60 * 60 * 1000; // 60 minutes (US-206)

async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password, { algorithm: "argon2id" });
}

export interface LoginInput {
  email: string;
  password?: string;
  otp?: string;
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

  async login(input: LoginInput): Promise<AuthenticatedUser> {
    const email = input.email.toLowerCase();
    const method = input.otp ? "OTP" : "PASSWORD";
    const user = await prisma.user.findUnique({ where: { email } });

    let success = false;
    if (user && user.status === "ACTIVE") {
      if (input.password && user.passwordHash) {
        success = await Bun.password.verify(input.password, user.passwordHash);
      } else if (input.otp) {
        success = await verifyOtp(email, input.otp);
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

    // Generic error — never reveal which factor failed (US-206)
    if (!success || !user) throw unauthorized("Invalid email or password");

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
    const ok = user.passwordHash && (await Bun.password.verify(currentPassword, user.passwordHash));
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
    const [notifications, loginActivity, messages] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
      prisma.loginActivity.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 500,
      }),
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
      notifications,
      loginActivity,
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

  async setWhatsappNumber(userId: string, number: string): Promise<void> {
    // Phase 1: number stored and marked verified immediately; a real provider
    // verification (challenge message) slots in behind this call later.
    await prisma.user.update({
      where: { id: userId },
      data: { whatsappNumber: number, whatsappVerifiedAt: new Date() },
    });
  }
}
