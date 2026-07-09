import "reflect-metadata";
import helmet from "@fastify/helmet";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";
import { env } from "./env";
import { logger } from "./lib/logger";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true }),
    { logger: ["error", "warn"] },
  );

  await app.register(helmet);
  app.enableCors({
    origin: env.corsOrigins,
    credentials: true,
    allowedHeaders: [
      "Authorization",
      "Content-Type",
      "x-client-ip",
      "x-client-user-agent",
      "x-request-id",
    ],
  });

  await app.listen(env.API_PORT, "0.0.0.0");
  logger.info("api listening", {
    url: await app.getUrl(),
    jobsInProcess: env.JOBS_IN_PROCESS,
  });
}

void bootstrap();
