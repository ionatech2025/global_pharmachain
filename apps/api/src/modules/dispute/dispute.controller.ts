import { Body, Controller, Get, HttpCode, Param, Post, Query, Req } from "@nestjs/common";
import {
  DISPUTE_STATUSES,
  type DisputeCreateInput,
  disputeCreateSchema,
  disputeResolveSchema,
  idParamSchema,
  optionalFilter,
} from "@pharmachain/core";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import {
  CurrentMembership,
  CurrentUser,
  OptionalMembership,
  RequireCompany,
  SuperAdminOnly,
  setAudit,
} from "../../common/decorators";
import { zodPipe } from "../../common/pipes/zod.pipe";
import type { AuthUser, Membership } from "../../lib/context";
import { DisputeService } from "./dispute.service";

const adminListQuerySchema = z.object({ status: optionalFilter(z.enum(DISPUTE_STATUSES)) });

@Controller()
export class DisputeController {
  constructor(private readonly disputeService: DisputeService) {}

  @RequireCompany()
  @HttpCode(201)
  @Post("orders/:id/disputes")
  async raise(
    @CurrentUser() user: AuthUser,
    @CurrentMembership() membership: Membership,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Body(zodPipe(disputeCreateSchema)) body: DisputeCreateInput,
    @Req() req: FastifyRequest,
  ) {
    const dispute = await this.disputeService.raise(user, membership, params.id, body);
    setAudit(req, {
      action: "dispute.raise",
      entityType: "Dispute",
      entityId: dispute.id,
      newValues: { orderId: params.id, subject: body.subject },
    });
    return dispute;
  }

  @RequireCompany()
  @Get("disputes")
  listMine(@CurrentMembership() membership: Membership) {
    return this.disputeService.listMine(membership);
  }

  @Get("orders/:id/disputes")
  listForOrder(
    @CurrentUser() user: AuthUser,
    @OptionalMembership() membership: Membership | undefined,
    @Param(zodPipe(idParamSchema)) params: { id: string },
  ) {
    return this.disputeService.listForOrder(user, membership, params.id);
  }

  @RequireCompany()
  @HttpCode(200)
  @Post("disputes/:id/escalate")
  async escalate(
    @CurrentMembership() membership: Membership,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Req() req: FastifyRequest,
  ) {
    const dispute = await this.disputeService.escalate(membership, params.id);
    setAudit(req, { action: "dispute.escalate", entityType: "Dispute", entityId: dispute.id });
    return dispute;
  }

  @RequireCompany()
  @HttpCode(200)
  @Post("disputes/:id/withdraw")
  async withdraw(
    @CurrentUser() user: AuthUser,
    @CurrentMembership() membership: Membership,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Req() req: FastifyRequest,
  ) {
    const dispute = await this.disputeService.withdraw(user, membership, params.id);
    setAudit(req, { action: "dispute.withdraw", entityType: "Dispute", entityId: dispute.id });
    return dispute;
  }

  // ─── Platform admin ────────────────────────────────────────────────────────

  @SuperAdminOnly()
  @Get("admin/disputes")
  adminList(@Query(zodPipe(adminListQuerySchema)) query: { status?: string }) {
    return this.disputeService.adminList(query.status);
  }

  @SuperAdminOnly()
  @HttpCode(200)
  @Post("admin/disputes/:id/resolve")
  async adminResolve(
    @CurrentUser() user: AuthUser,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Body(zodPipe(disputeResolveSchema)) body: { resolution: string },
    @Req() req: FastifyRequest,
  ) {
    const dispute = await this.disputeService.adminResolve(user, params.id, body.resolution);
    setAudit(req, {
      action: "dispute.resolve",
      entityType: "Dispute",
      entityId: dispute.id,
      reason: body.resolution,
    });
    return dispute;
  }
}
