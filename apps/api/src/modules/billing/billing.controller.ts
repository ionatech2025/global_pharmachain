import { Body, Controller, Get, Post, Req } from "@nestjs/common";
import { type CreditRequestCreate, creditRequestCreateSchema, PARAM_KEYS } from "@pharmachain/core";
import { Prisma, prisma } from "@pharmachain/db";
import { genericEventEmail } from "@pharmachain/email";
import { notify } from "@pharmachain/notifications";
import type { FastifyRequest } from "fastify";
import {
  CurrentMembership,
  CurrentUser,
  RequirePermission,
  setAudit,
} from "../../common/decorators";
import { zodPipe } from "../../common/pipes/zod.pipe";
import { env } from "../../env";
import type { AuthUser, Membership } from "../../lib/context";
import { getParam } from "../../lib/params";

/**
 * Pay-per-use credits beyond the Freemium limit (US-907). Payment happens
 * off-platform; a super admin confirms receipt, which raises this month's
 * effective limit (see billing/usage.ts).
 */
@Controller("billing")
export class BillingController {
  @RequirePermission("usage:read")
  @Get("credit-requests")
  list(@CurrentMembership() membership: Membership) {
    return prisma.creditRequest.findMany({
      where: { companyId: membership.companyId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  /** US-907: the fee is shown at the point of request, before submitting. */
  @RequirePermission("usage:read")
  @Get("credit-fees")
  async fees() {
    const [rfq, quotation, featured, verificationPremium, currency] = await Promise.all([
      getParam(PARAM_KEYS.CREDIT_FEE_RFQ_USD),
      getParam(PARAM_KEYS.CREDIT_FEE_QUOTATION_USD),
      getParam(PARAM_KEYS.FEATURED_FEE_USD),
      getParam(PARAM_KEYS.VERIFICATION_PREMIUM_FEE_USD),
      getParam(PARAM_KEYS.CREDIT_FEE_CURRENCY),
    ]);
    return { rfq, quotation, featured, verificationPremium, currency };
  }

  @RequirePermission("company:manage")
  @Post("credit-requests")
  async create(
    @CurrentUser() user: AuthUser,
    @CurrentMembership() membership: Membership,
    @Body(zodPipe(creditRequestCreateSchema)) body: CreditRequestCreate,
    @Req() req: FastifyRequest,
  ) {
    // Phase 4 §3 monetisation reuses the manual-payment credit flow: RFQ and
    // quotation credits price per unit; featured placement and the premium
    // verification package are flat purchases.
    const FEE_PARAM = {
      RFQ: PARAM_KEYS.CREDIT_FEE_RFQ_USD,
      QUOTATION: PARAM_KEYS.CREDIT_FEE_QUOTATION_USD,
      FEATURED: PARAM_KEYS.FEATURED_FEE_USD,
      VERIFICATION_PREMIUM: PARAM_KEYS.VERIFICATION_PREMIUM_FEE_USD,
    } as const;
    const flat = body.kind === "FEATURED" || body.kind === "VERIFICATION_PREMIUM";
    const count = flat ? 1 : body.count;
    const [feePerCredit, currency] = await Promise.all([
      getParam(FEE_PARAM[body.kind]),
      getParam(PARAM_KEYS.CREDIT_FEE_CURRENCY),
    ]);
    const fee = new Prisma.Decimal(feePerCredit).mul(count).toDP(2);
    const request = await prisma.creditRequest.create({
      data: {
        companyId: membership.companyId,
        kind: body.kind,
        count,
        fee,
        currency,
        requestedById: user.id,
      },
    });
    const superAdmins = await prisma.user.findMany({
      where: { isSuperAdmin: true, status: "ACTIVE" },
      select: { id: true },
    });
    await notify({
      userIds: superAdmins.map((u) => u.id),
      type: "CREDIT_UPDATE",
      title: "Credit request pending payment",
      body: `${membership.company.name} requested ${body.count} ${body.kind} credit(s) — ${currency} ${fee.toString()}.`,
      href: "/admin/credits",
      emailContent: genericEventEmail({
        title: "Credit request pending payment",
        body: `${membership.company.name} requested ${body.count} ${body.kind} credit(s) for ${currency} ${fee.toString()}. Confirm once payment is received.`,
        url: `${env.APP_URL}/admin/credits`,
      }),
    });
    setAudit(req, {
      action: "credit.request",
      entityType: "CreditRequest",
      entityId: request.id,
      newValues: { kind: body.kind, count: body.count, fee: fee.toString() },
    });
    return request;
  }
}
