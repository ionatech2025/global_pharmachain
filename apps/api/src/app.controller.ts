import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { Public } from "./common/decorators";

@Controller()
export class AppController {
  @Public()
  @SkipThrottle()
  @Get("health")
  health() {
    return { ok: true, service: "pharmachain-api" };
  }
}
