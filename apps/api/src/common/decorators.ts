import { createParamDecorator, type ExecutionContext, SetMetadata } from "@nestjs/common";
import type { Permission } from "@pharmachain/core";
import type { FastifyRequest } from "fastify";
import type { AuditEntry, AuthUser, Membership } from "../lib/context";
import { forbidden } from "./errors";

export const IS_PUBLIC_KEY = "pharmachain:isPublic";
/** Skips authentication (registration, login, password flows, health). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const SUPER_ADMIN_KEY = "pharmachain:superAdmin";
export const SuperAdminOnly = () => SetMetadata(SUPER_ADMIN_KEY, true);

export const REQUIRE_COMPANY_KEY = "pharmachain:requireCompany";
export const RequireCompany = () => SetMetadata(REQUIRE_COMPANY_KEY, true);

export const PERMISSION_KEY = "pharmachain:permission";
/** Server-side RBAC (US-204) — implies a company membership. */
export const RequirePermission = (permission: Permission) =>
  SetMetadata(PERMISSION_KEY, permission);

export const REQUIRE_VERIFIED_KEY = "pharmachain:requireVerified";
/** Marketplace actions are reserved for verified companies (US-103). */
export const RequireVerified = () => SetMetadata(REQUIRE_VERIFIED_KEY, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const user = ctx.switchToHttp().getRequest<FastifyRequest>().user;
  if (!user) throw forbidden();
  return user;
});

export const CurrentMembership = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Membership => {
    const membership = ctx.switchToHttp().getRequest<FastifyRequest>().membership;
    if (!membership) throw forbidden("This action requires a company account");
    return membership;
  },
);

export const OptionalMembership = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): Membership | undefined =>
    ctx.switchToHttp().getRequest<FastifyRequest>().membership,
);

/** Attach entity-level audit enrichment for the AuditInterceptor. */
export function setAudit(req: FastifyRequest, entry: AuditEntry): void {
  req.auditEntry = entry;
}
