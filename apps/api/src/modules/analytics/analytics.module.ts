import { Module } from "@nestjs/common";
import { AnalyticsController } from "./analytics.controller";
import { AnalyticsService } from "./analytics.service";
import { RatingService } from "./rating.service";

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, RatingService],
})
export class AnalyticsModule {}
