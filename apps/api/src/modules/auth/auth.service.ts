import { Injectable } from "@nestjs/common";
import type { AuthenticatedUser } from "@pharmachain/auth";
import { companyAccessBlocked, type RegisterInput } from "@pharmachain/core";
import { prisma } from "@pharmachain/db";
import { genericEventEmail, otpEmail, passwordResetEmail, welcomeEmail } from "@pharmachain/email";
import { notificationProviders, notify } from "@pharmachain/notifications";
import { recordAudit } from "../../common/audit";
import { ApiException, badRequest, conflict, forbidden, unauthorized } from "../../common/errors";
import { env } from "../../env";
import { generateOtpCode, hashOtp, hashToken, randomToken } from "../../lib/crypto";
import { defer } from "../../lib/defer";
import { hashPassword, verifyPassword } from "../../lib/password";
import { isBlockedPassword } from "../../lib/password-blocklist";
import { isPwnedPassword, pwnedCheckEnabled } from "../../lib/pwned";
import { isSealed, openSecret, sealSecret } from "../../lib/secret-box";
import { generateTotpSecret, matchTotp, otpauthUri, verifyTotp } from "../../lib/totp";
import { sendEmailTo } from "../shared/mailer";
import { INVITE_REJECTION_MESSAGES, inviteRejection } from "./invite-tokens";
import { issueOtp, verifyOtp } from "./otp";
import { PasskeyService } from "./passkey.service";
import { FORGOT_PASSWORD_MESSAGE, resetCoolingDown } from "./reset-link";
import { secondFactorFor } from "./second-factor";

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
  /** JSON text of the WebAuthn assertion a browser produced (a passkey sign-in). */
  passkey?: string;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly passkeys: PasskeyService) {}

  /**
   * Hash a NEW password after the policy's server-side checks (the length and structure
   * rules ran in the request schema). Used by every path that sets one — registration,
   * invitation, reset, change — so none can be a way round it. The compromised-password
   * lookup runs beside the Argon2 hash, so it adds time only if it is the slower of the two.
   */
  private async hashAcceptedPassword(password: string): Promise<string> {
    if (isBlockedPassword(password)) {
      throw badRequest(
        "That password is on lists of commonly used passwords. Choose a different one — a few unrelated words work well.",
      );
    }
    const [hash, pwned] = await Promise.all([
      hashPassword(password),
      pwnedCheckEnabled() ? isPwnedPassword(password) : Promise.resolve(false),
    ]);
    if (pwned) {
      throw badRequest(
        "That password has appeared in a data breach. Choose a different one that you have not used anywhere else.",
      );
    }
    return hash;
  }

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
      locale: user.locale ?? null,
      timeZone: user.timeZone ?? null,
      membership: user.membership
        ? {
            companyId: user.membership.companyId,
            companyName: user.membership.company.name,
            companyType: user.membership.company.type,
            role: user.membership.role,
            verificationStatus: user.membership.company.verificationStatus,
            previouslyVerified: user.membership.company.verifiedAt !== null,
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

    const passwordHash = await this.hashAcceptedPassword(input.admin.password);
    // One nested create: atomic like the interactive transaction it replaces,
    // but without its BEGIN/COMMIT round trips or a follow-up read for the new
    // user's id — onboarding is the first thing a new client waits on.
    const company = await prisma.company.create({
      data: {
        name: input.company.name,
        type: input.company.type,
        country: input.company.country,
        address: input.company.address,
        registrationNumber: input.company.registrationNumber,
        primaryContactName: input.admin.name,
        primaryContactEmail: email,
        primaryContactPhone: input.company.contactPhone,
        members: {
          create: {
            role: "COMPANY_ADMIN",
            user: { create: { email, name: input.admin.name, passwordHash, status: "ACTIVE" } },
          },
        },
      },
      include: { members: { select: { userId: true } } },
    });
    const adminId = company.members[0]?.userId;
    if (!adminId) throw new Error("registration created a company without its admin");
    await recordAudit(
      { id: adminId, email },
      {
        action: "company.register",
        entityType: "Company",
        entityId: company.id,
        companyId: company.id,
      },
    );
    defer(sendEmailTo(email, welcomeEmail({ companyName: company.name, appUrl: env.APP_URL })));
    return { companyId: company.id };
  }

  // ─── Login (US-205/206 + OTP) ──────────────────────────────────────────────

  /** Consecutive failures since the last success or password reset, within
   *  the lockout window. */
  private async recentFailureCount(email: string): Promise<number> {
    const windowStart = new Date(Date.now() - LOCKOUT_WINDOW_MS);
    const [lastSuccess, lastReset] = await Promise.all([
      prisma.loginActivity.findFirst({
        where: { email, success: true },
        orderBy: { createdAt: "desc" },
        select: { createdAt: true },
      }),
      // A completed password reset proves control of the mailbox, and the
      // lockout message tells a locked-out user to reset — so a reset must
      // actually lift the lock. It used to leave it in place for the rest of
      // the window, which also let anyone keep a known account locked out.
      prisma.passwordResetToken.findFirst({
        where: { user: { email }, consumedAt: { gt: windowStart } },
        orderBy: { consumedAt: "desc" },
        select: { consumedAt: true },
      }),
    ]);
    let since = windowStart;
    for (const at of [lastSuccess?.createdAt, lastReset?.consumedAt]) {
      if (at && at > since) since = at;
    }
    return prisma.loginActivity.count({
      where: { email, success: false, createdAt: { gt: since } },
    });
  }

  /**
   * Records that a TOTP time step has been used by this user; false when it
   * already was, so a code read over a shoulder or replayed from a phished
   * form cannot be used again within its validity window. The durable
   * throttle table doubles as the used-step store — one key per (user, step),
   * outliving the ±1-step window.
   */
  private async claimTotpStep(userId: string, step: number): Promise<boolean> {
    const rows = await prisma.$queryRaw<Array<{ key: string }>>`
      INSERT INTO "ThrottleBucket" ("key", "count", "expiresAt")
      VALUES (${`totp-used:${userId}:${step}`}, 1, now() + interval '5 minutes')
      ON CONFLICT ("key") DO NOTHING
      RETURNING "key"
    `;
    return rows.length > 0;
  }

  /** Verifies a code once: right code, unused step. */
  private async acceptTotp(userId: string, storedSecret: string, code: string): Promise<boolean> {
    const step = matchTotp(openSecret(storedSecret), code);
    return step !== null && (await this.claimTotpStep(userId, step));
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

    const user = await prisma.user.findUnique({
      where: { email },
      include: { membership: { select: { company: { select: { verificationStatus: true } } } } },
    });

    let success = false;
    if (user && user.status === "ACTIVE") {
      if (input.password && user.passwordHash) {
        success = await verifyPassword(input.password, user.passwordHash);
      } else if (input.otp) {
        success = await verifyOtp(email, input.otp);
      }
    }

    // Second factor. Which one is asked for is decided in one place (second-factor.ts).
    // The challenge responses below are thrown before the activity insert and never feed
    // the lockout counter (the password was right); a WRONG code or passkey is a real
    // failure and does count.
    let secondFactorFailed: "totp" | "passkey" | null = null;
    if (success && user) {
      const totpEnabled = Boolean(user.totpEnabledAt && user.totpSecret);
      const plan = secondFactorFor({
        isSuperAdmin: user.isSuperAdmin,
        passkeyCount: await this.passkeys.count(user.id),
        totpEnabled,
      });
      if (plan !== "none") {
        const usePasskey = plan !== "totp" && Boolean(input.passkey);
        const useTotp = !usePasskey && plan !== "passkey" && Boolean(input.totpCode);
        if (!usePasskey && !useTotp) {
          if (plan === "totp") {
            throw new ApiException(
              401,
              "TOTP_REQUIRED",
              "Enter the 6-digit code from your authenticator app",
            );
          }
          throw new ApiException(
            401,
            "PASSKEY_REQUIRED",
            "Confirm it is you with your passkey to finish signing in",
          );
        }
        if (usePasskey) {
          let assertion: unknown = null;
          try {
            assertion = JSON.parse(input.passkey as string);
          } catch {
            assertion = null;
          }
          const valid =
            typeof assertion === "object" &&
            assertion !== null &&
            typeof (assertion as { id?: unknown }).id === "string" &&
            (await this.passkeys.verifyAssertion(user.id, assertion as never));
          if (!valid) {
            success = false;
            secondFactorFailed = "passkey";
          }
        } else if (user.totpSecret) {
          if (!(await this.acceptTotp(user.id, user.totpSecret, input.totpCode as string))) {
            success = false;
            secondFactorFailed = "totp";
          } else if (!isSealed(user.totpSecret)) {
            // Seeds stored before encryption at rest are sealed on first use.
            await prisma.user.update({
              where: { id: user.id },
              data: { totpSecret: sealSecret(user.totpSecret) },
            });
          }
        }
      }
    }

    // A suspended or deleted company's members are refused — but only after the
    // credentials proved right, so the answer never confirms an account to a
    // stranger. Thrown before the activity insert, like the TOTP challenge: it
    // is not a failed attempt and must not feed the lockout counter.
    if (
      success &&
      user?.membership &&
      companyAccessBlocked(user.membership.company.verificationStatus)
    ) {
      throw new ApiException(
        403,
        "COMPANY_SUSPENDED",
        "Your company's access has been suspended by a platform administrator. Contact support.",
      );
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
      // Only reachable for a second-factor failure AFTER a correct first factor, so naming
      // the factor tells a stranger nothing about whether the account exists.
      if (secondFactorFailed === "passkey") {
        throw new ApiException(401, "PASSKEY_INVALID", "That passkey could not be verified");
      }
      throw unauthorized(
        secondFactorFailed === "totp" ? "Invalid verification code" : "Invalid email or password",
      );
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

  /**
   * Request a reset link. The answer is identical — in body AND in timing —
   * whether or not the address belongs to an account (OWASP Forgot Password
   * cheat sheet: consistent message, uniform response time). All the work,
   * including the lookup, runs after the response; an unknown or inactive
   * address simply issues nothing, so no link is ever sent to an address
   * without an active account.
   */
  async forgotPassword(email: string): Promise<{ message: string }> {
    defer(this.issueResetLink(email.toLowerCase()));
    return { message: FORGOT_PASSWORD_MESSAGE };
  }

  private async issueResetLink(email: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { email } });
    if (user?.status !== "ACTIVE") return;
    const latest = await prisma.passwordResetToken.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    if (resetCoolingDown(latest?.createdAt ?? null, new Date())) return;
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
    const passwordHash = await this.hashAcceptedPassword(password);
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
      data: {
        passwordHash: await this.hashAcceptedPassword(newPassword),
        sessionVersion: { increment: 1 },
      },
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
    const rejection = inviteRejection(invite);
    // The `!invite` half is redundant at runtime — inviteRejection already
    // answers "unknown" for it — but it is what narrows the row below.
    if (!invite || rejection) {
      throw forbidden(INVITE_REJECTION_MESSAGES[rejection ?? "unknown"]);
    }
    // Accepting builds a session without passing through login(), so a
    // suspended company must be refused here too — otherwise someone invited
    // before the suspension joins it afterwards.
    if (companyAccessBlocked(invite.company.verificationStatus)) {
      throw new ApiException(
        403,
        "COMPANY_SUSPENDED",
        "This company's access is suspended, so invitations cannot be accepted right now.",
      );
    }
    const email = invite.email.toLowerCase();
    const existing = await prisma.user.findUnique({
      where: { email },
      include: { membership: true },
    });
    if (existing?.membership) {
      throw conflict("This email is already active in another company");
    }

    const passwordHash = await this.hashAcceptedPassword(args.password);
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
    const [
      notifications,
      notificationTotal,
      loginActivity,
      loginActivityTotal,
      messages,
      supportIssues,
      authoredIssueMessagesCount,
    ] = await Promise.all([
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
      prisma.supportIssue
        .findMany({
          where: { reportedById: userId },
          orderBy: { createdAt: "desc" },
          take: EXPORT_WINDOW,
        })
        .catch(() => []),
      prisma.supportIssueMessage.count({ where: { authorId: userId } }).catch(() => 0),
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
      supportIssues,
      authoredIssueMessagesCount,
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
    // Sealed at rest; the plaintext goes only to the user, once, for the QR.
    await prisma.user.update({ where: { id: userId }, data: { totpSecret: sealSecret(secret) } });
    return { secret, otpauth: otpauthUri(secret, user.email) };
  }

  async enableTotp(userId: string, code: string): Promise<void> {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (user.totpEnabledAt) throw conflict("Two-factor authentication is already enabled");
    if (!user.totpSecret) throw badRequest("Start setup first");
    if (!verifyTotp(openSecret(user.totpSecret), code)) {
      throw badRequest("That code doesn't match — try again");
    }
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
    if (!(await this.acceptTotp(user.id, user.totpSecret, code))) {
      throw unauthorized("Invalid verification code");
    }
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
