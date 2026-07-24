import { randomBytes } from "node:crypto";
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Query, Req } from "@nestjs/common";
import {
  type ApiKeyCreateInput,
  apiKeyCreateSchema,
  idParamSchema,
  paginate,
  paginationQuerySchema,
  skipTake,
  type WebhookCreateInput,
  webhookCreateSchema,
} from "@pharmachain/core";
import { prisma } from "@pharmachain/db";
import type { FastifyRequest } from "fastify";
import {
  CurrentMembership,
  CurrentUser,
  Public,
  RequirePermission,
  setAudit,
} from "../../common/decorators";
import { badRequest, notFound } from "../../common/errors";
import { zodPipe } from "../../common/pipes/zod.pipe";
import type { AuthUser, Membership } from "../../lib/context";
import { assertSafeWebhookUrl, emitWebhookEvent, runWebhookDeliveryPass } from "../../lib/webhooks";
import { authenticateApiKey, generateApiKey } from "./api-key";

@Controller()
export class IntegrationsController {
  // ─── Partner webhooks (Phase 5 §3) ─────────────────────────────────────────

  @RequirePermission("company:manage")
  @Get("webhooks")
  async listWebhooks(@CurrentMembership() membership: Membership) {
    const hooks = await prisma.webhook.findMany({
      where: { companyId: membership.companyId },
      orderBy: { createdAt: "desc" },
    });
    // Secrets are shown once at creation only.
    return hooks.map(({ secret: _secret, ...hook }) => hook);
  }

  @RequirePermission("company:manage")
  @HttpCode(201)
  @Post("webhooks")
  async createWebhook(
    @CurrentUser() user: AuthUser,
    @CurrentMembership() membership: Membership,
    @Body(zodPipe(webhookCreateSchema)) body: WebhookCreateInput,
    @Req() req: FastifyRequest,
  ) {
    await assertSafeWebhookUrl(body.url).catch((err) => {
      throw badRequest(String(err instanceof Error ? err.message : err));
    });
    const secret = `whsec_${randomBytes(24).toString("hex")}`;
    const hook = await prisma.webhook.create({
      data: {
        companyId: membership.companyId,
        url: body.url,
        events: body.events,
        secret,
        createdById: user.id,
      },
    });
    setAudit(req, {
      action: "webhook.create",
      entityType: "Webhook",
      entityId: hook.id,
      newValues: { url: body.url, events: body.events },
    });
    // The signing secret is revealed exactly once.
    return { id: hook.id, url: hook.url, events: hook.events, secret };
  }

  @RequirePermission("company:manage")
  @HttpCode(200)
  @Delete("webhooks/:id")
  async deleteWebhook(
    @CurrentMembership() membership: Membership,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Req() req: FastifyRequest,
  ) {
    const result = await prisma.webhook.updateMany({
      where: { id: params.id, companyId: membership.companyId },
      data: { active: false },
    });
    if (result.count === 0) throw notFound("Webhook not found");
    setAudit(req, { action: "webhook.disable", entityType: "Webhook", entityId: params.id });
    return { ok: true };
  }

  /** Fires a signed test event at the endpoint (delivered inline). */
  @RequirePermission("company:manage")
  @HttpCode(200)
  @Post("webhooks/:id/test")
  async testWebhook(
    @CurrentMembership() membership: Membership,
    @Param(zodPipe(idParamSchema)) params: { id: string },
  ) {
    const hook = await prisma.webhook.findFirst({
      where: { id: params.id, companyId: membership.companyId, active: true },
    });
    if (!hook) throw notFound("Webhook not found");
    await emitWebhookEvent([membership.companyId], "order.created", {
      test: true,
      message: "PharmaChain webhook test delivery",
    });
    const result = await runWebhookDeliveryPass();
    return { ok: true, deliveredNow: result.delivered };
  }

  @RequirePermission("company:manage")
  @Get("webhooks/:id/deliveries")
  async deliveries(
    @CurrentMembership() membership: Membership,
    @Param(zodPipe(idParamSchema)) params: { id: string },
  ) {
    const hook = await prisma.webhook.findFirst({
      where: { id: params.id, companyId: membership.companyId },
      select: { id: true },
    });
    if (!hook) throw notFound("Webhook not found");
    return prisma.webhookDelivery.findMany({
      where: { webhookId: params.id },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        event: true,
        attempts: true,
        deliveredAt: true,
        lastStatus: true,
        lastError: true,
        createdAt: true,
      },
    });
  }

  // ─── API keys (Phase 5 §4) ─────────────────────────────────────────────────

  @RequirePermission("company:manage")
  @Get("api-keys")
  listKeys(@CurrentMembership() membership: Membership) {
    return prisma.apiKey.findMany({
      where: { companyId: membership.companyId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        prefix: true,
        scopes: true,
        rateLimitPerMin: true,
        lastUsedAt: true,
        revokedAt: true,
        createdAt: true,
      },
    });
  }

  @RequirePermission("company:manage")
  @HttpCode(201)
  @Post("api-keys")
  async createKey(
    @CurrentUser() user: AuthUser,
    @CurrentMembership() membership: Membership,
    @Body(zodPipe(apiKeyCreateSchema)) body: ApiKeyCreateInput,
    @Req() req: FastifyRequest,
  ) {
    const { token, prefix, hashedKey } = generateApiKey();
    const key = await prisma.apiKey.create({
      data: {
        companyId: membership.companyId,
        name: body.name,
        prefix,
        hashedKey,
        scopes: body.scopes,
        rateLimitPerMin: body.rateLimitPerMin ?? 60,
        createdById: user.id,
      },
    });
    setAudit(req, {
      action: "api-key.create",
      entityType: "ApiKey",
      entityId: key.id,
      newValues: { name: body.name, scopes: body.scopes },
    });
    // Token revealed exactly once — only its hash is stored.
    return { id: key.id, name: key.name, prefix, scopes: key.scopes, token };
  }

  @RequirePermission("company:manage")
  @HttpCode(200)
  @Post("api-keys/:id/revoke")
  async revokeKey(
    @CurrentMembership() membership: Membership,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Req() req: FastifyRequest,
  ) {
    const result = await prisma.apiKey.updateMany({
      where: { id: params.id, companyId: membership.companyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (result.count === 0) throw notFound("API key not found");
    setAudit(req, { action: "api-key.revoke", entityType: "ApiKey", entityId: params.id });
    return { ok: true };
  }

  // ─── Public partner API v1 (Phase 5 §4) ────────────────────────────────────
  // Key-authenticated (Authorization: Bearer pck_…), scoped, per-key
  // rate-limited. This surface is what ERP/accounting connectors consume.

  @Public()
  @Get("v1/catalogue")
  async v1Catalogue(
    @Req() req: FastifyRequest,
    @Query(zodPipe(paginationQuerySchema)) query: { page: number; pageSize: number },
  ) {
    await authenticateApiKey(req, "read:catalogue");
    const where = {
      status: "PUBLISHED" as const,
      company: { verificationStatus: "VERIFIED" as const },
    };
    const [items, total] = await prisma.$transaction([
      prisma.listing.findMany({
        where,
        select: {
          id: true,
          name: true,
          kind: true,
          casNumber: true,
          countryOfOrigin: true,
          price: true,
          currency: true,
          unit: true,
          standards: true,
          company: { select: { id: true, name: true, country: true } },
        },
        orderBy: { name: "asc" },
        ...skipTake(query),
      }),
      prisma.listing.count({ where }),
    ]);
    return paginate(items, total, query);
  }

  @Public()
  @Get("v1/orders")
  async v1Orders(
    @Req() req: FastifyRequest,
    @Query(zodPipe(paginationQuerySchema)) query: { page: number; pageSize: number },
  ) {
    const ctx = await authenticateApiKey(req, "read:orders");
    const where = {
      OR: [{ buyerCompanyId: ctx.companyId }, { sellerCompanyId: ctx.companyId }],
    };
    const [items, total] = await prisma.$transaction([
      prisma.order.findMany({
        where,
        select: {
          id: true,
          orderNo: true,
          title: true,
          status: true,
          quantity: true,
          unit: true,
          totalAmount: true,
          currency: true,
          eta: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        ...skipTake(query),
      }),
      prisma.order.count({ where }),
    ]);
    return paginate(items, total, query);
  }

  @Public()
  @Get("v1/rfqs")
  async v1Rfqs(
    @Req() req: FastifyRequest,
    @Query(zodPipe(paginationQuerySchema)) query: { page: number; pageSize: number },
  ) {
    const ctx = await authenticateApiKey(req, "read:rfqs");
    const where = { buyerCompanyId: ctx.companyId };
    const [items, total] = await prisma.$transaction([
      prisma.rfq.findMany({
        where,
        select: {
          id: true,
          refNo: true,
          title: true,
          status: true,
          quantity: true,
          unit: true,
          deadline: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        ...skipTake(query),
      }),
      prisma.rfq.count({ where }),
    ]);
    return paginate(items, total, query);
  }

  @Public()
  @Get("v1/orders/:id/trace")
  async v1Trace(@Req() req: FastifyRequest, @Param(zodPipe(idParamSchema)) params: { id: string }) {
    const ctx = await authenticateApiKey(req, "read:trace");
    const order = await prisma.order.findFirst({
      where: {
        id: params.id,
        OR: [{ buyerCompanyId: ctx.companyId }, { sellerCompanyId: ctx.companyId }],
      },
      select: { id: true, orderNo: true },
    });
    if (!order) throw notFound("Order not found");
    const events = await prisma.traceEvent.findMany({
      where: { orderId: order.id },
      orderBy: { seq: "asc" },
      select: { seq: true, type: true, at: true, hash: true, prevHash: true },
    });
    return { orderNo: order.orderNo, events };
  }
}
