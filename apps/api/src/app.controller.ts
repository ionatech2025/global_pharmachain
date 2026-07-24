import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { prisma } from "@pharmachain/db";
import { Public } from "./common/decorators";
import { ApiException } from "./common/errors";

@Controller()
export class AppController {
  /** Liveness: the process is up and serving. Never touches dependencies. */
  @Public()
  @SkipThrottle()
  @Get("health")
  health() {
    return { ok: true, service: "pharmachain-api" };
  }

  /** Readiness: safe to route traffic here — the database answers. */
  @Public()
  @SkipThrottle()
  @Get("health/ready")
  async ready() {
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ApiException(503, "NOT_READY", "Database unreachable");
    }
    return { ok: true };
  }

  /** Live public counters for the marketing site (review brand-integrity
   *  finding: hero vignettes carried fictional numbers). 5-minute cache. */
  @Public()
  @Get("stats/public")
  async publicStats() {
    const now = Date.now();
    if (statsCache && now - statsCache.at < 5 * 60_000) return statsCache.value;
    const [verifiedCompanies, publishedListings, countries] = await Promise.all([
      prisma.company.count({ where: { verificationStatus: "VERIFIED" } }),
      prisma.listing.count({ where: { status: "PUBLISHED" } }),
      prisma.company.findMany({
        where: { verificationStatus: "VERIFIED" },
        select: { country: true },
        distinct: ["country"],
      }),
    ]);
    const value = { verifiedCompanies, publishedListings, countries: countries.length };
    statsCache = { at: now, value };
    return value;
  }
}

let statsCache: { at: number; value: Record<string, number> } | null = null;
