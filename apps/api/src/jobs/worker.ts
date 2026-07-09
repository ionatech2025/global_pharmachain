// Standalone jobs worker: `bun run jobs` (or a dedicated container) when the
// API runs with JOBS_IN_PROCESS=false.
import "reflect-metadata";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { logger } from "../lib/logger";
import { JobsModule } from "./jobs.module";

@Module({
  imports: [ScheduleModule.forRoot(), JobsModule],
})
class WorkerModule {}

async function bootstrap(): Promise<void> {
  await NestFactory.createApplicationContext(WorkerModule, { logger: ["error", "warn"] });
  logger.info("jobs worker running");
}

void bootstrap();
