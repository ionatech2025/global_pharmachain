import { Controller, Get } from "@nestjs/common";
import { CurrentUser, OptionalMembership } from "../../common/decorators";
import type { AuthUser, Membership } from "../../lib/context";
import { ActivityService } from "./activity.service";
import { DashboardService } from "./dashboard.service";

@Controller("dashboard")
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly activityService: ActivityService,
  ) {}

  @Get("summary")
  summary(@CurrentUser() user: AuthUser, @OptionalMembership() membership: Membership | undefined) {
    return this.dashboardService.summary(user, membership);
  }

  /** Weekly series, period-over-period deltas and the live pipeline mix. */
  @Get("activity")
  activity(
    @CurrentUser() user: AuthUser,
    @OptionalMembership() membership: Membership | undefined,
  ) {
    return this.activityService.activity(user, membership);
  }
}
