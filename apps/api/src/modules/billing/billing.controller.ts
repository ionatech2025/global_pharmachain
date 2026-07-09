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

  @RequirePermission("company:manage")
  @Post("credit-requests")
  async create(
    @CurrentUser() user: AuthUser,
    @CurrentMembership() membership: Membership,
    @Body(zodPipe(creditRequestCreateSchema)) body: CreditRequestCreate,
    @Req() req: FastifyRequest,
  ) {
    const feePerCredit = await getParam(
      body.kind === "RFQ" ? PARAM_KEYS.CREDIT_FEE_RFQ_USD : PARAM_KEYS.CREDIT_FEE_QUOTATION_USD,
    );
    const fee = new Prisma.Decimal(feePerCredit).mul(body.count).toDP(2);
    const request = await prisma.creditRequest.create({
      data: {
        companyId: membership.companyId,
        kind: body.kind,
        count: body.count,
        fee,
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
      body: `${membership.company.name} requested ${body.count} ${body.kind} credit(s) — USD ${fee.toString()}.`,
      href: "/admin/credits",
      emailContent: genericEventEmail({
        title: "Credit request pending payment",
        body: `${membership.company.name} requested ${body.count} ${body.kind} credit(s) for USD ${fee.toString()}. Confirm once payment is received.`,
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
