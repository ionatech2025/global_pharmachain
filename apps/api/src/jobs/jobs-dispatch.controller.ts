import { timingSafeEqual } from "node:crypto";
import { Controller, Get, Query, Req } from "@nestjs/common";
import { prisma } from "@pharmachain/db";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { Public, SuperAdminOnly } from "../common/decorators";
import { ApiException, notFound } from "../common/errors";
import { zodPipe } from "../common/pipes/zod.pipe";
import { type JobTier, jobNames, runRegisteredJob } from "./registry";

const runQuerySchema = z.object({
  tier: z.enum(["frequent", "daily"]).optional(),
  job: z.string().max(60).optional(),
});

/**
 * HTTP host for scheduled work (P0 remediation, review finding 01): the
 * serverless deployment cannot run @Cron, so GitHub Actions cron workflows
 * call this endpoint — `tier=frequent` every 10 minutes, `tier=daily` once a
 * day — authenticated with a constant-time check against CRON_SECRET.
 * Advisory locks inside runRegisteredJob make overlapping calls harmless.
 */
@Controller("jobs")
export class JobsDispatchController {
  @Public()
  @Get("run")
  async run(
    @Req() req: FastifyRequest,
    @Query(zodPipe(runQuerySchema)) query: { tier?: JobTier; job?: string },
  ) {
    const secret = process.env.CRON_SECRET ?? "";
    if (!secret) throw notFound(); // dispatcher disabled until configured
    const presented = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    const a = Buffer.from(presented);
    const b = Buffer.from(secret);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ApiException(401, "UNAUTHORIZED", "Invalid cron credential");
    }

    const names = query.job ? [query.job] : jobNames(query.tier ?? "frequent");
    const results = [];
    for (const name of names) {
      results.push(await runRegisteredJob(name));
    }
    return {
      tier: query.job ? undefined : (query.tier ?? "frequent"),
      ran: results.length,
      results,
    };
  }

  /** Job freshness for the platform team (the SLO finding 01 lacked). */
  @SuperAdminOnly()
  @Get("heartbeats")
  heartbeats() {
    return prisma.jobHeartbeat.findMany({ orderBy: { name: "asc" } });
  }
}
