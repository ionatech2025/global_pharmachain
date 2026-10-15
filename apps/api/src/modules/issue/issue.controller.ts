import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import {
  type IssueAdminUpdateInput,
  type IssueCreateInput,
  type IssueQuery,
  type IssueReplyInput,
  idParamSchema,
  issueAdminUpdateSchema,
  issueCreateSchema,
  issueQuerySchema,
  issueReplySchema,
} from "@pharmachain/core";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { CurrentUser, OptionalMembership, SuperAdminOnly, setAudit } from "../../common/decorators";
import { zodPipe } from "../../common/pipes/zod.pipe";
import type { AuthUser, Membership } from "../../lib/context";
import { IssueService } from "./issue.service";

const ownStatusSchema = z.object({
  status: z.enum(["OPEN", "CLOSED"]),
});

@Controller()
export class IssueController {
  constructor(private readonly issueService: IssueService) {}

  @Throttle({ default: { limit: 20, ttl: 10 * 60 * 1000 } })
  @HttpCode(201)
  @Post("issues")
  async create(
    @CurrentUser() user: AuthUser,
    @OptionalMembership() membership: Membership | undefined,
    @Body(zodPipe(issueCreateSchema)) body: IssueCreateInput,
    @Req() req: FastifyRequest,
  ) {
    const issue = await this.issueService.create(user, membership, body);
    setAudit(req, {
      action: "issue.raise",
      entityType: "SupportIssue",
      entityId: issue.id,
      companyId: membership?.companyId,
      newValues: {
        refNo: issue.refNo,
        category: issue.category,
        priority: issue.priority,
        subject: issue.subject,
      },
    });
    return issue;
  }

  @Get("issues")
  listMine(
    @CurrentUser() user: AuthUser,
    @OptionalMembership() membership: Membership | undefined,
    @Query(zodPipe(issueQuerySchema)) query: IssueQuery,
  ) {
    return this.issueService.listMine(user, membership, query);
  }

  @Get("issues/:id")
  detail(
    @CurrentUser() user: AuthUser,
    @OptionalMembership() membership: Membership | undefined,
    @Param(zodPipe(idParamSchema)) params: { id: string },
  ) {
    return this.issueService.detail(user, membership, params.id);
  }

  @Throttle({ default: { limit: 60, ttl: 10 * 60 * 1000 } })
  @HttpCode(201)
  @Post("issues/:id/messages")
  async addMessage(
    @CurrentUser() user: AuthUser,
    @OptionalMembership() membership: Membership | undefined,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Body(zodPipe(issueReplySchema)) body: IssueReplyInput,
    @Req() req: FastifyRequest,
  ) {
    const message = await this.issueService.addMessage(user, membership, params.id, body);
    setAudit(req, {
      action: "issue.reply",
      entityType: "SupportIssue",
      entityId: params.id,
      companyId: membership?.companyId,
    });
    return message;
  }

  @HttpCode(200)
  @Post("issues/:id/status")
  async updateOwnStatus(
    @CurrentUser() user: AuthUser,
    @OptionalMembership() membership: Membership | undefined,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Body(zodPipe(ownStatusSchema)) body: { status: "OPEN" | "CLOSED" },
    @Req() req: FastifyRequest,
  ) {
    const updated = await this.issueService.updateOwnStatus(
      user,
      membership,
      params.id,
      body.status,
    );
    setAudit(req, {
      action: body.status === "CLOSED" ? "issue.close" : "issue.reopen",
      entityType: "SupportIssue",
      entityId: params.id,
      companyId: membership?.companyId,
      newValues: { status: body.status },
    });
    return updated;
  }

  // ─── Platform admin / Development team ─────────────────────────────────────

  @SuperAdminOnly()
  @Get("admin/issues")
  adminList(@Query(zodPipe(issueQuerySchema)) query: IssueQuery) {
    return this.issueService.adminList(query);
  }

  @SuperAdminOnly()
  @Patch("admin/issues/:id")
  async adminUpdate(
    @CurrentUser() user: AuthUser,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Body(zodPipe(issueAdminUpdateSchema)) body: IssueAdminUpdateInput,
    @Req() req: FastifyRequest,
  ) {
    const { before, updated } = await this.issueService.adminUpdate(user, params.id, body);
    setAudit(req, {
      action: "issue.admin-update",
      entityType: "SupportIssue",
      entityId: updated.id,
      companyId: updated.companyId ?? undefined,
      oldValues: { status: before.status, priority: before.priority },
      newValues: {
        status: updated.status,
        priority: updated.priority,
        resolution: updated.resolution,
      },
      reason: body.resolution,
    });
    return updated;
  }
}
