import { Body, Controller, Get, Param, Post, Req } from "@nestjs/common";
import {
  type CreditPaymentStart,
  type CreditRequestCreate,
  creditPaymentStartSchema,
  creditRequestCreateSchema,
  idParamSchema,
  PARAM_KEYS,
} from "@pharmachain/core";
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
import { enabledPaymentMethods } from "../../lib/payment-gateways";
import { BillingService } from "./billing.service";

/**
 * Pay-per-use credits beyond the Freemium limit (US-907). The fee is paid
 * inside the platform through the same gateways order payments use: card and
 * mobile money settle on the provider webhook, bank transfer and escrow
 * produce a quotable reference the platform team confirms against. Either way
 * a confirmed request raises this month's effective limit (billing/usage.ts).
 */
@Controller("billing")
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  /**
   * Payment methods this deployment can settle a *platform fee* with. Escrow
   * is excluded on purpose: it exists so two trading companies can put money
   * with a third party, which is meaningless for a fee owed to the platform.
   */
  @RequirePermission("usage:read")
  @Get("payment-methods")
  paymentMethods() {
    return enabledPaymentMethods().filter((m) => m.method !== "ESCROW");
  }
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
    const [rfq, quotation, featured, verificationPremium, insights, currency] = await Promise.all([
      getParam(PARAM_KEYS.CREDIT_FEE_RFQ_USD),
      getParam(PARAM_KEYS.CREDIT_FEE_QUOTATION_USD),
      getParam(PARAM_KEYS.FEATURED_FEE_USD),
      getParam(PARAM_KEYS.VERIFICATION_PREMIUM_FEE_USD),
      getParam(PARAM_KEYS.DATA_INSIGHTS_FEE_USD),
      getParam(PARAM_KEYS.CREDIT_FEE_CURRENCY),
    ]);
    return { rfq, quotation, featured, verificationPremium, insights, currency };
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
      DATA_INSIGHTS: PARAM_KEYS.DATA_INSIGHTS_FEE_USD,
    } as const;
    const flat = body.kind !== "RFQ" && body.kind !== "QUOTATION";
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

  /** Start checkout for a pending fee — returns the payment instructions. */
  @RequirePermission("company:manage")
  @Post("credit-requests/:id/pay")
  async pay(
    @CurrentMembership() membership: Membership,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Body(zodPipe(creditPaymentStartSchema)) body: CreditPaymentStart,
    @Req() req: FastifyRequest,
  ) {
    const result = await this.billingService.initiatePayment(membership, params.id, body.method);
    setAudit(req, {
      action: "credit.payment-initiate",
      entityType: "CreditRequest",
      entityId: params.id,
      newValues: { method: body.method, ref: result.request.paymentRef },
    });
    return result;
  }

  /** Bank transfer / escrow only: "I have sent the money" — not a grant. */
  @RequirePermission("company:manage")
  @Post("credit-requests/:id/declare-paid")
  async declarePaid(
    @CurrentUser() user: AuthUser,
    @CurrentMembership() membership: Membership,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Req() req: FastifyRequest,
  ) {
    const request = await this.billingService.declarePaid(user, membership, params.id);
    setAudit(req, {
      action: "credit.payment-declared",
      entityType: "CreditRequest",
      entityId: params.id,
    });
    return request;
  }
}
