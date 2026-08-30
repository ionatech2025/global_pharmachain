import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
} from "@nestjs/common";
import {
  type AnnouncementInput,
  adminReasonSchema,
  adminRoleReassignSchema,
  announcementSchema,
  auditLogQuerySchema,
  creditDecisionSchema,
  exchangeRateUpsertSchema,
  idParamSchema,
  optionalFilter,
  PARAM_DEFINITIONS,
  paginate,
  paginationQuerySchema,
  parameterUpdateSchema,
  skipTake,
  tierUpdateSchema,
  validateParamValue,
} from "@pharmachain/core";
import type { CompanyRole, Prisma, SubscriptionTier } from "@pharmachain/db";
import { prisma } from "@pharmachain/db";
import { genericEventEmail } from "@pharmachain/email";
import { notify } from "@pharmachain/notifications";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { CurrentUser, SuperAdminOnly, setAudit } from "../../common/decorators";
import { badRequest, conflict, notFound } from "../../common/errors";
import { zodPipe } from "../../common/pipes/zod.pipe";
import { env } from "../../env";
import type { AuthUser } from "../../lib/context";
import { invalidateParamCache } from "../../lib/params";
import { BillingService } from "../billing/billing.service";
import { platformStats } from "../dashboard/dashboard.service";
import { AdminService } from "./admin.service";

const companiesQuerySchema = paginationQuerySchema.extend({
  status: optionalFilter(
    z.enum(["PENDING_VERIFICATION", "VERIFIED", "REJECTED", "EXPIRED_DOCUMENT"]),
  ),
  q: optionalFilter(z.string().max(120)),
});
type CompaniesQuery = z.infer<typeof companiesQuerySchema>;

const loginActivityQuerySchema = paginationQuerySchema.extend({
  userId: optionalFilter(z.uuid()),
  email: optionalFilter(z.string().max(200)),
});
type LoginActivityQuery = z.infer<typeof loginActivityQuerySchema>;

const verificationDecisionBody = z.object({
  decision: z.enum(["APPROVE", "REJECT"]),
  reason: z.string().max(1000).optional(),
});
type VerificationDecisionBody = z.infer<typeof verificationDecisionBody>;
type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

@SuperAdminOnly()
@Controller("admin")
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly billingService: BillingService,
  ) {}

  @Get("stats")
  stats() {
    return platformStats();
  }

  // ── Verification (US-103/104) ──────────────────────────────────────────────

  @Get("companies")
  async companies(@Query(zodPipe(companiesQuerySchema)) query: CompaniesQuery) {
    const where: Prisma.CompanyWhereInput = {
      ...(query.status ? { verificationStatus: query.status } : {}),
      ...(query.q ? { name: { contains: query.q, mode: "insensitive" } } : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.company.findMany({
        where,
        orderBy: { createdAt: "asc" }, // queue sorted by submission date (US-103)
        ...skipTake(query),
        select: {
          id: true,
          name: true,
          type: true,
          country: true,
          verificationStatus: true,
          subscriptionTier: true,
          reverificationDueAt: true,
          createdAt: true,
        },
      }),
      prisma.company.count({ where }),
    ]);
    return paginate(items, total, query);
  }

  @Get("companies/:id")
  companyDetail(@Param(zodPipe(idParamSchema)) params: { id: string }) {
    return this.adminService.companyDetail(params.id);
  }

  @HttpCode(200)
  @Post("companies/:id/verify")
  async verify(
    @CurrentUser() user: AuthUser,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Body(zodPipe(verificationDecisionBody)) body: VerificationDecisionBody,
    @Req() req: FastifyRequest,
  ) {
    if (body.decision === "REJECT" && (!body.reason || body.reason.trim().length < 5)) {
      throw badRequest("A rejection reason (min 5 characters) is required");
    }
    const result = await this.adminService.decideVerification(user.id, params.id, body);
    setAudit(req, {
      action: result.approved ? "company.verify-approve" : "company.verify-reject",
      entityType: "Company",
      entityId: params.id,
      companyId: params.id,
      oldValues: { verificationStatus: result.previousStatus },
      newValues: { verificationStatus: result.approved ? "VERIFIED" : "REJECTED" },
      reason: body.reason,
    });
    return { ok: true };
  }

  @Patch("companies/:id/tier")
  async updateTier(
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Body(zodPipe(tierUpdateSchema)) body: { tier: SubscriptionTier },
    @Req() req: FastifyRequest,
  ) {
    const before = await prisma.company.findUnique({ where: { id: params.id } });
    if (!before) throw notFound("Company not found");
    const company = await prisma.company.update({
      where: { id: params.id },
      data: { subscriptionTier: body.tier },
    });
    // US-905: company notified of tier change
    await notify({
      companyId: params.id,
      roles: ["COMPANY_ADMIN"],
      type: "TIER_CHANGE",
      title: `Subscription tier: ${body.tier}`,
      body: `Your company's subscription tier is now ${body.tier}.`,
      href: "/company/usage",
      emailContent: genericEventEmail({
        title: "Subscription tier updated",
        body: `${company.name} is now on the ${body.tier} tier.`,
        url: `${env.APP_URL}/company/usage`,
      }),
    });
    setAudit(req, {
      action: "company.tier-change",
      entityType: "Company",
      entityId: params.id,
      companyId: params.id,
      oldValues: { tier: before.subscriptionTier },
      newValues: { tier: body.tier },
    });
    return company;
  }

  // ── User overrides (US-203) ────────────────────────────────────────────────

  @HttpCode(200)
  @Post("users/:id/reset-password")
  async resetPassword(
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Body(zodPipe(adminReasonSchema)) body: { reason: string },
    @Req() req: FastifyRequest,
  ) {
    const { user, emailSent } = await this.adminService.adminResetPassword(params.id);
    setAudit(req, {
      action: "admin.user-password-reset",
      entityType: "User",
      entityId: user.id,
      newValues: { emailSent },
      reason: body.reason,
    });
    return { ok: true, emailSent };
  }

  @HttpCode(200)
  @Post("users/:id/deactivate")
  async deactivateUser(
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Body(zodPipe(adminReasonSchema)) body: { reason: string },
    @Req() req: FastifyRequest,
  ) {
    await this.adminService.adminSetUserStatus(params.id, false);
    setAudit(req, {
      action: "admin.user-deactivate",
      entityType: "User",
      entityId: params.id,
      reason: body.reason,
    });
    return { ok: true };
  }

  @HttpCode(200)
  @Post("users/:id/reactivate")
  async reactivateUser(
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Body(zodPipe(adminReasonSchema)) body: { reason: string },
    @Req() req: FastifyRequest,
  ) {
    await this.adminService.adminSetUserStatus(params.id, true);
    setAudit(req, {
      action: "admin.user-reactivate",
      entityType: "User",
      entityId: params.id,
      reason: body.reason,
    });
    return { ok: true };
  }

  @HttpCode(200)
  @Post("users/:id/role")
  async reassignRole(
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Body(zodPipe(adminRoleReassignSchema)) body: { role: CompanyRole; reason: string },
    @Req() req: FastifyRequest,
  ) {
    const { oldRole } = await this.adminService.adminReassignRole(params.id, body.role);
    setAudit(req, {
      action: "admin.user-role-reassign",
      entityType: "User",
      entityId: params.id,
      oldValues: { role: oldRole },
      newValues: { role: body.role },
      reason: body.reason,
    });
    return { ok: true };
  }

  @HttpCode(200)
  @Post("users/:id/anonymize")
  async anonymize(
    @CurrentUser() user: AuthUser,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Body(zodPipe(adminReasonSchema)) body: { reason: string },
    @Req() req: FastifyRequest,
  ) {
    const { before } = await this.adminService.anonymizeUser(user.id, params.id);
    setAudit(req, {
      action: "admin.user-anonymize",
      entityType: "User",
      entityId: params.id,
      oldValues: before,
      reason: body.reason,
    });
    return { ok: true };
  }

  // ── Login activity (US-205) ────────────────────────────────────────────────

  @Get("login-activity")
  async loginActivity(@Query(zodPipe(loginActivityQuerySchema)) query: LoginActivityQuery) {
    const where: Prisma.LoginActivityWhereInput = {
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.email ? { email: { contains: query.email, mode: "insensitive" } } : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.loginActivity.findMany({ where, orderBy: { createdAt: "desc" }, ...skipTake(query) }),
      prisma.loginActivity.count({ where }),
    ]);
    // US-205 TC2: 5+ consecutive failures flagged for review
    const flagged = items.length >= 5 && items.slice(0, 5).every((a) => !a.success);
    return { ...paginate(items, total, query), flagged };
  }

  // ── GDPR deletion queue (US-1003) ──────────────────────────────────────────

  @Get("data-deletion-requests")
  dataDeletionRequests() {
    return prisma.dataDeletionRequest.findMany({
      where: { status: "PENDING" },
      include: { user: { select: { id: true, email: true, name: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  // ── Audit logs (US-903) ────────────────────────────────────────────────────

  @Get("audit-logs")
  async auditLogs(@Query(zodPipe(auditLogQuerySchema)) query: AuditLogQuery) {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.actorUserId ? { actorUserId: query.actorUserId } : {}),
      ...(query.actorEmail
        ? { actorEmail: { contains: query.actorEmail, mode: "insensitive" } }
        : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.companyId ? { companyId: query.companyId } : {}),
      ...(query.from || query.to
        ? {
            createdAt: {
              ...(query.from ? { gte: new Date(query.from) } : {}),
              ...(query.to ? { lte: new Date(query.to) } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, ...skipTake(query) }),
      prisma.auditLog.count({ where }),
    ]);
    return paginate(items, total, query);
  }

  // ── Announcements (US-902) ─────────────────────────────────────────────────

  @Get("announcements")
  announcements() {
    return prisma.announcement.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        createdBy: { select: { name: true } },
        targetCompany: { select: { name: true } },
      },
    });
  }

  @Post("announcements")
  async createAnnouncement(
    @CurrentUser() user: AuthUser,
    @Body(zodPipe(announcementSchema)) body: AnnouncementInput,
    @Req() req: FastifyRequest,
  ) {
    const announcement = await prisma.announcement.create({
      data: {
        title: body.title,
        body: body.body,
        audience: body.audience,
        targetRole: body.audience === "ROLE" ? body.targetRole : null,
        targetCompanyId: body.audience === "COMPANY" ? body.targetCompanyId : null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        createdById: user.id,
      },
    });
    // US-902: targeted users also see it in the notification centre, not just
    // the banner. In-app only — announcements are ambient, not email-worthy.
    const audienceUsers = await prisma.user.findMany({
      where: {
        status: "ACTIVE",
        ...(body.audience === "ROLE" ? { membership: { role: body.targetRole ?? undefined } } : {}),
        ...(body.audience === "COMPANY"
          ? { membership: { companyId: body.targetCompanyId ?? undefined } }
          : {}),
      },
      select: { id: true },
    });
    await notify({
      userIds: audienceUsers.map((u) => u.id),
      type: "ANNOUNCEMENT",
      title: announcement.title,
      body:
        announcement.body.length > 200 ? `${announcement.body.slice(0, 200)}…` : announcement.body,
      href: "/dashboard",
    });
    setAudit(req, {
      action: "announcement.publish",
      entityType: "Announcement",
      entityId: announcement.id,
      newValues: { title: announcement.title, audience: announcement.audience },
    });
    return announcement;
  }

  @Patch("announcements/:id")
  async updateAnnouncement(
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Body(zodPipe(announcementSchema)) body: AnnouncementInput,
    @Req() req: FastifyRequest,
  ) {
    const before = await prisma.announcement.findUnique({ where: { id: params.id } });
    if (!before) throw notFound("Announcement not found");
    if (before.status === "RETRACTED") throw conflict("Retracted announcements cannot be edited");
    const announcement = await prisma.announcement.update({
      where: { id: params.id },
      data: {
        title: body.title,
        body: body.body,
        audience: body.audience,
        targetRole: body.audience === "ROLE" ? body.targetRole : null,
        targetCompanyId: body.audience === "COMPANY" ? body.targetCompanyId : null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
    });
    setAudit(req, {
      action: "announcement.update",
      entityType: "Announcement",
      entityId: params.id,
      oldValues: { title: before.title },
      newValues: { title: announcement.title },
    });
    return announcement;
  }

  @HttpCode(200)
  @Post("announcements/:id/retract")
  async retractAnnouncement(
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Req() req: FastifyRequest,
  ) {
    const announcement = await prisma.announcement.update({
      where: { id: params.id },
      data: { status: "RETRACTED" },
    });
    setAudit(req, {
      action: "announcement.retract",
      entityType: "Announcement",
      entityId: params.id,
    });
    return announcement;
  }

  // ── System parameters (US-904) ─────────────────────────────────────────────

  @Get("parameters")
  async parameters() {
    // Merge with the definitions so parameters added after the last seed still
    // appear (showing their default) instead of silently missing from the UI.
    const rows = await prisma.systemParameter.findMany({ orderBy: { key: "asc" } });
    const byKey = new Map(rows.map((r) => [r.key, r]));
    return PARAM_DEFINITIONS.map(
      (def) =>
        byKey.get(def.key) ?? {
          id: def.key,
          key: def.key,
          value: def.defaultValue,
          type: def.type,
          description: def.description,
          updatedById: null,
          createdAt: null,
          updatedAt: null,
        },
    );
  }

  @Put("parameters")
  async updateParameter(
    @CurrentUser() user: AuthUser,
    @Body(zodPipe(parameterUpdateSchema)) body: { key: string; value: string },
    @Req() req: FastifyRequest,
  ) {
    const row = await prisma.systemParameter.findUnique({ where: { key: body.key } });
    if (!row) throw notFound("Parameter not found");
    if (!validateParamValue(row.type as "int" | "decimal" | "csv-int", body.value)) {
      throw badRequest(`Invalid value for ${body.key} (expected ${row.type})`);
    }
    const updated = await prisma.systemParameter.update({
      where: { key: body.key },
      data: { value: body.value, updatedById: user.id },
    });
    invalidateParamCache();
    // Old and new values recorded (US-904)
    setAudit(req, {
      action: "parameter.update",
      entityType: "SystemParameter",
      entityId: updated.id,
      oldValues: { [body.key]: row.value },
      newValues: { [body.key]: body.value },
    });
    return updated;
  }

  // ── Exchange rates (display-only multi-currency) ───────────────────────────

  @Get("exchange-rates")
  exchangeRates() {
    return prisma.exchangeRate.findMany({ orderBy: [{ base: "asc" }, { quote: "asc" }] });
  }

  @Put("exchange-rates")
  async upsertExchangeRate(
    @Body(zodPipe(exchangeRateUpsertSchema)) body: { base: string; quote: string; rate: string },
    @Req() req: FastifyRequest,
  ) {
    const before = await prisma.exchangeRate.findUnique({
      where: { base_quote: { base: body.base, quote: body.quote } },
    });
    const rate = await prisma.exchangeRate.upsert({
      where: { base_quote: { base: body.base, quote: body.quote } },
      update: { rate: body.rate },
      create: { base: body.base, quote: body.quote, rate: body.rate },
    });
    setAudit(req, {
      action: "exchange-rate.upsert",
      entityType: "ExchangeRate",
      entityId: rate.id,
      oldValues: before ? { rate: before.rate.toString() } : undefined,
      newValues: { base: body.base, quote: body.quote, rate: body.rate },
    });
    return rate;
  }

  // ── Credit requests (US-907) ───────────────────────────────────────────────

  @Get("credit-requests")
  creditRequests() {
    return prisma.creditRequest.findMany({
      where: { status: "PENDING_PAYMENT" },
      include: {
        company: { select: { id: true, name: true, subscriptionTier: true } },
        requestedBy: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: "asc" },
    });
  }

  @HttpCode(200)
  @Post("credit-requests/:id/decide")
  async decideCreditRequest(
    @CurrentUser() user: AuthUser,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Body(zodPipe(creditDecisionSchema)) body: { decision: "CONFIRM" | "REJECT"; note?: string },
    @Req() req: FastifyRequest,
  ) {
    const confirm = body.decision === "CONFIRM";
    // Same settlement path the provider webhook uses, so the grants a
    // confirmed purchase unlocks cannot drift between the two routes.
    const request = await this.billingService.settle(
      params.id,
      confirm ? "CONFIRMED" : "REJECTED",
      { confirmedById: user.id, note: body.note },
    );
    setAudit(req, {
      action: confirm ? "credit.confirm" : "credit.reject",
      entityType: "CreditRequest",
      entityId: params.id,
      companyId: request.companyId,
      newValues: { kind: request.kind, count: request.count, fee: request.fee.toString() },
      reason: body.note,
    });
    return { ok: true };
  }
}
