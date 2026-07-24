import { Module } from "@nestjs/common";
import { IntelligenceController } from "./intelligence.controller";
import { IntelligenceService } from "./intelligence.service";
import { TraceService } from "./trace.service";

@Module({
  controllers: [IntelligenceController],
  providers: [IntelligenceService, TraceService],
})
export class IntelligenceModule {}
