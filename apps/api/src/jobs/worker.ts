// Standalone jobs worker: `bun run jobs` (or a dedicated container) when the
// API runs with JOBS_IN_PROCESS=false.
import "reflect-metadata";
import { Module, type OnApplicationShutdown } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ScheduleModule } from "@nestjs/schedule";
import { prisma } from "@pharmachain/db";
import { logger } from "../lib/logger";
import { JobsModule } from "./jobs.module";

@Module({
  imports: [ScheduleModule.forRoot(), JobsModule],
})
class WorkerModule implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    await prisma.$disconnect();
  }
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(WorkerModule, {
    logger: ["error", "warn"],
  });
  app.enableShutdownHooks();
  logger.info("jobs worker running");
}

void bootstrap();
