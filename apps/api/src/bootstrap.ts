import "reflect-metadata";
import helmet from "@fastify/helmet";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { AppModule } from "./app.module";
import { env } from "./env";

/** Shared by the long-running server (main.ts) and the serverless handler
 *  (serverless.ts) so middleware/CORS can never drift between the two. */
export async function createApp(): Promise<NestFastifyApplication> {
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

  return app;
}
