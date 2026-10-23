import { Body, Controller, Get, HttpCode, Param, Post, Put, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  acceptInviteSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  idParamSchema,
  otpRequestSchema,
  PASSWORD_MAX_LENGTH,
  type RegisterInput,
  registerSchema,
  resetPasswordSchema,
  whatsappSchema,
} from "@pharmachain/core";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { CurrentUser, Public, setAudit } from "../../common/decorators";
import { unauthorized } from "../../common/errors";
import { zodPipe } from "../../common/pipes/zod.pipe";
import type { AuthUser } from "../../lib/context";
import { clientIp } from "../../lib/context";
import { AuthService } from "./auth.service";
import { PasskeyService } from "./passkey.service";

const loginBodySchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH).optional(),
  otp: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
  totpCode: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
  // The browser's WebAuthn assertion, as JSON text.
  passkey: z.string().max(16_384).optional(),
});
type LoginBody = z.infer<typeof loginBodySchema>;

// The browser's WebAuthn response is checked cryptographically by the library; the schema
// only bounds what is accepted and pins the shape the library reads.
const passkeyRegisterBodySchema = z.object({
  response: z.looseObject({
    id: z.string().min(1).max(1024),
    type: z.literal("public-key"),
    response: z.looseObject({}),
  }),
  name: z.string().trim().max(60).default("Passkey"),
});
const passkeyRemoveBodySchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly passkeys: PasskeyService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60 * 60 * 1000 } })
  @Post("register")
  register(@Body(zodPipe(registerSchema)) body: RegisterInput) {
    return this.authService.register(body);
  }

  /** Internal endpoint for the web app's Auth.js authorize() callback. */
  @Public()
  // 40/15 min per IP: sized for shared egress points (office NAT, CI) now that
  // the limit is durable across instances; the 5-failure per-account lockout in
  // AuthService remains the primary credential-stuffing control.
  @Throttle({ default: { limit: 40, ttl: 15 * 60 * 1000 } })
  @HttpCode(200)
  @Post("login")
  login(@Body(zodPipe(loginBodySchema)) body: LoginBody, @Req() req: FastifyRequest) {
    if (!body.password && !body.otp) throw unauthorized("Invalid email or password");
    return this.authService.login({
      ...body,
      ip: (req.headers["x-client-ip"] as string | undefined) || clientIp(req),
      userAgent:
        (req.headers["x-client-user-agent"] as string | undefined) ||
        (req.headers["user-agent"] as string | undefined),
    });
  }

  // ─── Passkeys (WebAuthn second factor) ─────────────────────────────────────

  /** Public on purpose: it names no account, so it reveals nothing about any account. */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 15 * 60 * 1000 } })
  @HttpCode(200)
  @Post("passkey/options")
  passkeySignInOptions() {
    return this.passkeys.authenticationOptions();
  }

  @Get("passkeys")
  listPasskeys(@CurrentUser() user: AuthUser) {
    return this.passkeys.list(user.id);
  }

  @Throttle({ default: { limit: 20, ttl: 15 * 60 * 1000 } })
  @HttpCode(200)
  @Post("passkeys/register/options")
  passkeyRegistrationOptions(@CurrentUser() user: AuthUser) {
    return this.passkeys.registrationOptions(user);
  }

  @Throttle({ default: { limit: 20, ttl: 15 * 60 * 1000 } })
  @HttpCode(201)
  @Post("passkeys/register/verify")
  passkeyRegistrationVerify(
    @CurrentUser() user: AuthUser,
    @Body(zodPipe(passkeyRegisterBodySchema)) body: z.infer<typeof passkeyRegisterBodySchema>,
  ) {
    return this.passkeys.verifyRegistration(user, body.response as never, body.name);
  }

  @Throttle({ default: { limit: 10, ttl: 15 * 60 * 1000 } })
  @HttpCode(200)
  @Post("passkeys/:id/remove")
  async removePasskey(
    @CurrentUser() user: AuthUser,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Body(zodPipe(passkeyRemoveBodySchema)) body: z.infer<typeof passkeyRemoveBodySchema>,
  ) {
    await this.passkeys.remove(user, params.id, body.currentPassword);
    return { ok: true };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 15 * 60 * 1000 } })
  @HttpCode(200)
  @Post("otp/request")
  async requestOtp(@Body(zodPipe(otpRequestSchema)) body: { email: string }) {
    await this.authService.requestOtp(body.email);
    return { ok: true };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 15 * 60 * 1000 } })
  @HttpCode(200)
  @Post("password/forgot")
  async forgotPassword(@Body(zodPipe(forgotPasswordSchema)) body: { email: string }) {
    const { message } = await this.authService.forgotPassword(body.email);
    return { ok: true, message };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 15 * 60 * 1000 } })
  @HttpCode(200)
  @Post("password/reset")
  async resetPassword(
    @Body(zodPipe(resetPasswordSchema)) body: { token: string; password: string },
  ) {
    await this.authService.resetPassword(body.token, body.password);
    return { ok: true };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 15 * 60 * 1000 } })
  @HttpCode(200)
  @Post("invites/accept")
  acceptInvite(
    @Body(zodPipe(acceptInviteSchema)) body: { token: string; name: string; password: string },
  ) {
    return this.authService.acceptInvite(body);
  }

  // ─── Authenticated account endpoints ───────────────────────────────────────

  @Get("me")
  me(@CurrentUser() user: AuthUser) {
    return this.authService.buildAuthenticatedUser(user.id);
  }

  @HttpCode(200)
  @Post("me/change-password")
  async changePassword(
    @CurrentUser() user: AuthUser,
    @Body(zodPipe(changePasswordSchema)) body: { currentPassword: string; newPassword: string },
    @Req() req: FastifyRequest,
  ) {
    await this.authService.changePassword(user.id, body.currentPassword, body.newPassword);
    setAudit(req, { action: "user.password-change", entityType: "User", entityId: user.id });
    return { ok: true };
  }

  @HttpCode(200)
  @Post("me/totp/setup")
  setupTotp(@CurrentUser() user: AuthUser) {
    return this.authService.setupTotp(user.id);
  }

  @HttpCode(200)
  @Post("me/totp/enable")
  async enableTotp(
    @CurrentUser() user: AuthUser,
    @Body(zodPipe(z.object({ code: z.string().regex(/^\d{6}$/) }))) body: { code: string },
    @Req() req: FastifyRequest,
  ) {
    await this.authService.enableTotp(user.id, body.code);
    setAudit(req, { action: "user.totp-enable", entityType: "User", entityId: user.id });
    return { ok: true };
  }

  @HttpCode(200)
  @Post("me/totp/disable")
  async disableTotp(
    @CurrentUser() user: AuthUser,
    @Body(
      zodPipe(
        z.object({
          password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
          code: z.string().regex(/^\d{6}$/),
        }),
      ),
    )
    body: { password: string; code: string },
    @Req() req: FastifyRequest,
  ) {
    await this.authService.disableTotp(user.id, body.password, body.code);
    setAudit(req, { action: "user.totp-disable", entityType: "User", entityId: user.id });
    return { ok: true };
  }

  @Put("me/whatsapp")
  async setWhatsapp(
    @CurrentUser() user: AuthUser,
    @Body(zodPipe(whatsappSchema)) body: { number: string },
    @Req() req: FastifyRequest,
  ) {
    await this.authService.setWhatsappNumber(user.id, body.number);
    setAudit(req, { action: "user.whatsapp-update", entityType: "User", entityId: user.id });
    return { ok: true, verificationSent: true };
  }

  @HttpCode(200)
  @Post("me/whatsapp/verify")
  async verifyWhatsapp(
    @CurrentUser() user: AuthUser,
    @Body(zodPipe(z.object({ code: z.string().regex(/^\d{6}$/) }))) body: { code: string },
    @Req() req: FastifyRequest,
  ) {
    await this.authService.verifyWhatsappNumber(user.id, body.code);
    setAudit(req, { action: "user.whatsapp-verify", entityType: "User", entityId: user.id });
    return { ok: true };
  }

  @Get("me/export")
  exportData(@CurrentUser() user: AuthUser) {
    return this.authService.exportOwnData(user.id);
  }

  @HttpCode(200)
  @Post("me/deletion-request")
  async requestDeletion(@CurrentUser() user: AuthUser) {
    await this.authService.requestDeletion(user.id);
    return { ok: true };
  }
}
