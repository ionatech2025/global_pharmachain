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
  complianceProfileSchema,
  type DashboardPrefInput,
  dashboardPrefSchema,
  idParamSchema,
  localePrefSchema,
  type PushSubscribeInput,
  pushSubscribeSchema,
  RATING_STATUSES,
  type RatingCreateInput,
  ratingCreateSchema,
  ratingFlagSchema,
  ratingModerateSchema,
} from "@pharmachain/core";
import { prisma } from "@pharmachain/db";
import { vapidPublicKey } from "@pharmachain/notifications";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import {
  CurrentMembership,
  CurrentUser,
  OptionalMembership,
  RequireCompany,
  RequirePermission,
  SuperAdminOnly,
  setAudit,
} from "../../common/decorators";
import { zodPipe } from "../../common/pipes/zod.pipe";
import type { AuthUser, Membership } from "../../lib/context";
import { AnalyticsService } from "./analytics.service";
import { RatingService } from "./rating.service";

const ratingListQuerySchema = z.object({ status: z.enum(RATING_STATUSES).optional() });

@Controller()
export class AnalyticsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly ratingService: RatingService,
  ) {}

  // ─── KPIs & dashboard customisation (Phase 4 §2) ───────────────────────────

  @Get("analytics/kpis")
  kpis(@CurrentUser() user: AuthUser, @OptionalMembership() membership: Membership | undefined) {
    return this.analyticsService.kpis(user, membership);
  }

  @Get("me/dashboard")
  dashboard(
    @CurrentUser() user: AuthUser,
    @OptionalMembership() membership: Membership | undefined,
  ) {
    return this.analyticsService.dashboardPrefs(user, membership);
  }

  @Put("me/dashboard")
  saveDashboard(
    @CurrentUser() user: AuthUser,
    @Body(zodPipe(dashboardPrefSchema)) body: DashboardPrefInput,
  ) {
    return this.analyticsService.saveDashboardPrefs(user, body.widgets);
  }

  // ─── Locale & timezone (Phase 4 §4) ────────────────────────────────────────

  @Patch("me/locale")
  async setLocale(
    @CurrentUser() user: AuthUser,
    @Body(zodPipe(localePrefSchema)) body: { locale: string | null; timeZone: string | null },
  ) {
    await prisma.user.update({
      where: { id: user.id },
      data: { locale: body.locale, timeZone: body.timeZone },
    });
    return { ok: true };
  }

  // ─── Web Push (Phase 4 §1) ─────────────────────────────────────────────────

  @Get("push/vapid-key")
  vapidKey() {
    return { publicKey: vapidPublicKey() };
  }

  @HttpCode(201)
  @Post("push/subscriptions")
  async subscribe(
    @CurrentUser() user: AuthUser,
    @Body(zodPipe(pushSubscribeSchema)) body: PushSubscribeInput,
    @Req() req: FastifyRequest,
  ) {
    await prisma.pushSubscription.upsert({
      where: { endpoint: body.endpoint },
      update: { userId: user.id, p256dh: body.keys.p256dh, auth: body.keys.auth },
      create: {
        userId: user.id,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        userAgent: (req.headers["user-agent"] as string | undefined)?.slice(0, 200),
      },
    });
    return { ok: true };
  }

  @HttpCode(200)
  @Post("push/subscriptions/remove")
  async unsubscribe(
    @CurrentUser() user: AuthUser,
    @Body(zodPipe(z.object({ endpoint: z.url().max(1000) }))) body: { endpoint: string },
  ) {
    await prisma.pushSubscription.deleteMany({
      where: { endpoint: body.endpoint, userId: user.id },
    });
    return { ok: true };
  }

  // ─── Ratings & trust (Phase 4 §3) ──────────────────────────────────────────

  @RequireCompany()
  @HttpCode(201)
  @Post("orders/:id/ratings")
  async rate(
    @CurrentUser() user: AuthUser,
    @CurrentMembership() membership: Membership,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Body(zodPipe(ratingCreateSchema)) body: RatingCreateInput,
    @Req() req: FastifyRequest,
  ) {
    const rating = await this.ratingService.rate(user, membership, params.id, body);
    setAudit(req, {
      action: "rating.create",
      entityType: "Rating",
      entityId: rating.id,
      newValues: { stars: body.stars, targetCompanyId: body.targetCompanyId },
    });
    return rating;
  }

  @Get("companies/:id/ratings")
  companyRatings(@Param(zodPipe(idParamSchema)) params: { id: string }) {
    return this.ratingService.forCompany(params.id);
  }

  @RequirePermission("company:manage")
  @HttpCode(200)
  @Post("ratings/:id/flag")
  async flag(
    @CurrentMembership() membership: Membership,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Body(zodPipe(ratingFlagSchema)) body: { reason: string },
    @Req() req: FastifyRequest,
  ) {
    const rating = await this.ratingService.flag(membership, params.id, body.reason);
    setAudit(req, {
      action: "rating.flag",
      entityType: "Rating",
      entityId: rating.id,
      reason: body.reason,
    });
    return rating;
  }

  @SuperAdminOnly()
  @Get("admin/ratings")
  adminRatings(@Query(zodPipe(ratingListQuerySchema)) query: { status?: string }) {
    return this.ratingService.adminList(query.status);
  }

  @SuperAdminOnly()
  @HttpCode(200)
  @Post("admin/ratings/:id/moderate")
  async moderate(
    @CurrentUser() user: AuthUser,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Body(zodPipe(ratingModerateSchema)) body: { action: "RESTORE" | "REMOVE"; note?: string },
    @Req() req: FastifyRequest,
  ) {
    const rating = await this.ratingService.moderate(user, params.id, body.action);
    setAudit(req, {
      action: "rating.moderate",
      entityType: "Rating",
      entityId: rating.id,
      newValues: { action: body.action },
      ...(body.note ? { reason: body.note } : {}),
    });
    return rating;
  }

  // ─── Compliance profile (Phase 4 §4) ───────────────────────────────────────

  @RequirePermission("company:manage")
  @Patch("company/compliance")
  async updateCompliance(
    @CurrentMembership() membership: Membership,
    @Body(zodPipe(complianceProfileSchema))
    body: { reachStatus?: string | null; ehsReport?: string | null },
    @Req() req: FastifyRequest,
  ) {
    const updated = await prisma.company.update({
      where: { id: membership.companyId },
      data: {
        ...(body.reachStatus !== undefined ? { reachStatus: body.reachStatus } : {}),
        ...(body.ehsReport !== undefined ? { ehsReport: body.ehsReport } : {}),
      },
      select: { id: true, reachStatus: true, ehsReport: true },
    });
    setAudit(req, {
      action: "company.compliance-update",
      entityType: "Company",
      entityId: membership.companyId,
      newValues: body,
    });
    return updated;
  }
}
