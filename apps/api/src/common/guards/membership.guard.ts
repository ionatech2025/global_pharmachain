import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { companyAccessBlocked } from "@pharmachain/core";
import { prisma } from "@pharmachain/db";
import type { FastifyRequest } from "fastify";
import { ApiException } from "../errors";

/**
 * Loads the caller's company membership fresh from the database (no stale
 * token data — verification status and role changes apply immediately).
 * Super admins pass through without a membership; they operate via /admin.
 */
@Injectable()
export class MembershipGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    if (req.user && !req.membership) {
      const membership = await prisma.companyUserRole.findUnique({
        where: { userId: req.user.id },
        include: {
          company: {
            select: {
              id: true,
              name: true,
              type: true,
              verificationStatus: true,
              subscriptionTier: true,
              profileStatus: true,
            },
          },
        },
      });
      if (membership) {
        // Suspension also bumps every member's session version, so this is the
        // backstop for a request already past that check.
        if (companyAccessBlocked(membership.company.verificationStatus)) {
          throw new ApiException(
            403,
            "COMPANY_SUSPENDED",
            "Your company's access has been suspended by a platform administrator.",
          );
        }
        req.membership = {
          companyId: membership.companyId,
          role: membership.role,
          company: membership.company,
        };
      }
    }
    return true;
  }
}
