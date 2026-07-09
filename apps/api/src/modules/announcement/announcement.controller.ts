import { Controller, Get } from "@nestjs/common";
import { prisma } from "@pharmachain/db";
import { OptionalMembership } from "../../common/decorators";
import type { Membership } from "../../lib/context";

/** User-facing feed for banners + notification centre (US-902). */
@Controller("announcements")
export class AnnouncementController {
  @Get("active")
  async active(@OptionalMembership() membership: Membership | undefined) {
    const now = new Date();
    return prisma.announcement.findMany({
      where: {
        status: "PUBLISHED",
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        AND: [
          {
            OR: [
              { audience: "ALL" },
              ...(membership ? [{ audience: "ROLE" as const, targetRole: membership.role }] : []),
              ...(membership
                ? [{ audience: "COMPANY" as const, targetCompanyId: membership.companyId }]
                : []),
            ],
          },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, title: true, body: true, createdAt: true, expiresAt: true },
    });
  }
}
