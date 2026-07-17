import { Controller, Get } from "@nestjs/common";
import { CurrentUser, OptionalMembership } from "../../common/decorators";
import type { AuthUser, Membership } from "../../lib/context";
import { DashboardService } from "./dashboard.service";

@Controller("dashboard")
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get("summary")
  summary(@CurrentUser() user: AuthUser, @OptionalMembership() membership: Membership | undefined) {
    return this.dashboardService.summary(user, membership);
  }
}
