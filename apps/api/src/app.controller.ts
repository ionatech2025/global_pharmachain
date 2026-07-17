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
}
