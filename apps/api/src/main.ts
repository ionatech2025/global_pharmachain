import "reflect-metadata";
import { createApp } from "./bootstrap";
import { env } from "./env";
import { logger } from "./lib/logger";

async function bootstrap(): Promise<void> {
  const app = await createApp();

  // SIGTERM/SIGINT drain in-flight requests, then fire OnApplicationShutdown
  // (Prisma disconnect in AppModule) — required for clean rolling deploys.
  app.enableShutdownHooks();

  await app.listen(env.API_PORT, "0.0.0.0");
  logger.info("api listening", {
    url: await app.getUrl(),
    jobsInProcess: env.JOBS_IN_PROCESS,
  });
}

void bootstrap();
