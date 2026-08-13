import { Module } from "@nestjs/common";
import { ActivityService } from "./activity.service";
import { DashboardController } from "./dashboard.controller";
import { DashboardService } from "./dashboard.service";

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, ActivityService],
})
export class DashboardModule {}
