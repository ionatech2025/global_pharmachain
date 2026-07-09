import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { prisma } from "@pharmachain/db";
import type { FastifyRequest } from "fastify";

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
