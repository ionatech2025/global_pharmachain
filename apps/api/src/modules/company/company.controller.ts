import { Body, Controller, Get, HttpCode, Param, Patch, Post, Req } from "@nestjs/common";
import {
  type CompanyProfileUpdate,
  companyProfileUpdateSchema,
  idParamSchema,
  inviteSchema,
  memberRoleSchema,
} from "@pharmachain/core";
import type { CompanyRole } from "@pharmachain/db";
import type { FastifyRequest } from "fastify";
import {
  CurrentMembership,
  CurrentUser,
  RequireCompany,
  RequirePermission,
  setAudit,
} from "../../common/decorators";
import { zodPipe } from "../../common/pipes/zod.pipe";
import type { AuthUser, Membership } from "../../lib/context";
import { getUsageSummary } from "../billing/usage";
import type { CompanyService } from "./company.service";

@Controller("companies")
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @RequireCompany()
  @Get("me")
  async me(@CurrentMembership() membership: Membership) {
    const company = await this.companyService.getMyCompany(membership.companyId);
    return { company, role: membership.role };
  }

  @RequirePermission("profile:manage")
  @Patch("me")
  async updateProfile(
    @CurrentMembership() membership: Membership,
    @Body(zodPipe(companyProfileUpdateSchema)) body: CompanyProfileUpdate,
    @Req() req: FastifyRequest,
  ) {
    const { after, diff } = await this.companyService.updateProfile(membership.companyId, body);
    setAudit(req, {
      action: "company.profile-update",
      entityType: "Company",
      entityId: after.id,
      oldValues: diff.old,
      newValues: diff.new,
    });
    return after;
  }

  @RequirePermission("profile:manage")
  @HttpCode(200)
  @Post("me/profile/publish")
  async publishProfile(@CurrentMembership() membership: Membership, @Req() req: FastifyRequest) {
    const company = await this.companyService.publishProfile(membership.companyId);
    setAudit(req, {
      action: "company.profile-publish",
      entityType: "Company",
      entityId: company.id,
    });
    return company;
  }

  @RequireCompany()
  @Get("me/verification")
  verification(@CurrentMembership() membership: Membership) {
    return this.companyService.verificationChecklist(membership.companyId);
  }

  @RequirePermission("members:manage")
  @Get("me/members")
  members(@CurrentMembership() membership: Membership) {
    return this.companyService.listMembers(membership.companyId);
  }

  @RequirePermission("members:manage")
  @Patch("me/members/:userId/role")
  async updateMemberRole(
    @CurrentMembership() membership: Membership,
    @Param("userId") userId: string,
    @Body(zodPipe(memberRoleSchema)) body: { role: CompanyRole },
    @Req() req: FastifyRequest,
  ) {
    const { oldRole, updated } = await this.companyService.updateMemberRole(
      membership.companyId,
      userId,
      body.role,
    );
    setAudit(req, {
      action: "member.role-change",
      entityType: "User",
      entityId: updated.userId,
      oldValues: { role: oldRole },
      newValues: { role: updated.role },
    });
    return updated;
  }

  @RequirePermission("members:manage")
  @HttpCode(200)
  @Post("me/members/:userId/deactivate")
  async deactivateMember(
    @CurrentMembership() membership: Membership,
    @Param("userId") userId: string,
    @Req() req: FastifyRequest,
  ) {
    const user = await this.companyService.deactivateMember(membership.companyId, userId);
    setAudit(req, { action: "member.deactivate", entityType: "User", entityId: user.id });
    return { ok: true };
  }

  @RequirePermission("members:manage")
  @HttpCode(200)
  @Post("me/members/:userId/reactivate")
  async reactivateMember(
    @CurrentMembership() membership: Membership,
    @Param("userId") userId: string,
    @Req() req: FastifyRequest,
  ) {
    const user = await this.companyService.reactivateMember(membership.companyId, userId);
    setAudit(req, { action: "member.reactivate", entityType: "User", entityId: user.id });
    return { ok: true };
  }

  @RequirePermission("members:manage")
  @Get("me/invites")
  invites(@CurrentMembership() membership: Membership) {
    return this.companyService.listInvites(membership.companyId);
  }

  @RequirePermission("members:manage")
  @Post("me/invites")
  async createInvite(
    @CurrentMembership() membership: Membership,
    @CurrentUser() user: AuthUser,
    @Body(zodPipe(inviteSchema)) body: { email: string; role: CompanyRole },
    @Req() req: FastifyRequest,
  ) {
    const invite = await this.companyService.createInvite({
      companyId: membership.companyId,
      companyName: membership.company.name,
      email: body.email,
      role: body.role,
      invitedById: user.id,
    });
    setAudit(req, {
      action: "member.invite",
      entityType: "Invite",
      entityId: invite.id,
      newValues: { email: invite.email, role: invite.role },
    });
    return invite;
  }

  @RequirePermission("members:manage")
  @HttpCode(200)
  @Post("me/invites/:id/revoke")
  async revokeInvite(
    @CurrentMembership() membership: Membership,
    @Param(zodPipe(idParamSchema)) params: { id: string },
    @Req() req: FastifyRequest,
  ) {
    const invite = await this.companyService.revokeInvite(membership.companyId, params.id);
    setAudit(req, { action: "member.invite-revoke", entityType: "Invite", entityId: invite.id });
    return { ok: true };
  }

  @RequirePermission("usage:read")
  @Get("me/usage")
  usage(@CurrentMembership() membership: Membership) {
    return getUsageSummary(membership.companyId, membership.company.subscriptionTier);
  }

  /** Public (authenticated) supplier/company profile view — US-301/404. */
  @Get(":id")
  publicProfile(@Param(zodPipe(idParamSchema)) params: { id: string }) {
    return this.companyService.findCompanyPublic(params.id);
  }
}
