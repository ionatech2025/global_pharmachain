import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { can, type Permission } from "@pharmachain/core";
import type { FastifyRequest } from "fastify";
import {
  PERMISSION_KEY,
  REQUIRE_COMPANY_KEY,
  REQUIRE_VERIFIED_KEY,
  SUPER_ADMIN_KEY,
} from "../decorators";
import { forbidden, unauthorized } from "../errors";

/** Enforces route policy metadata: @SuperAdminOnly, @RequireCompany,
 *  @RequirePermission (US-204 server-side RBAC), @RequireVerified (US-103). */
@Injectable()
export class PolicyGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];
    const req = context.switchToHttp().getRequest<FastifyRequest>();

    if (this.reflector.getAllAndOverride<boolean>(SUPER_ADMIN_KEY, targets)) {
      if (!req.user?.isSuperAdmin) throw unauthorized("Super admin access required");
    }

    const permission = this.reflector.getAllAndOverride<Permission | undefined>(
      PERMISSION_KEY,
      targets,
    );
    const requireCompany =
      this.reflector.getAllAndOverride<boolean>(REQUIRE_COMPANY_KEY, targets) ||
      permission !== undefined ||
      this.reflector.getAllAndOverride<boolean>(REQUIRE_VERIFIED_KEY, targets);

    if (requireCompany && !req.membership) {
      throw forbidden("This action requires a company account");
    }
    if (permission && (!req.membership || !can(req.membership.role, permission))) {
      throw forbidden();
    }
    if (
      this.reflector.getAllAndOverride<boolean>(REQUIRE_VERIFIED_KEY, targets) &&
      req.membership?.company.verificationStatus !== "VERIFIED"
    ) {
      throw forbidden("Your company must be verified to perform this action");
    }
    return true;
  }
}
