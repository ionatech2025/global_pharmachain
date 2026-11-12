import "reflect-metadata";
import helmet from "@fastify/helmet";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import { ALLOWED_MIMES, MAX_FILE_SIZE_BYTES } from "@pharmachain/core";
import type { FastifyInstance } from "fastify";
import { AppModule } from "./app.module";
import { env } from "./env";
import { registerRequestLogging } from "./lib/request-log";

// Every MIME type an upload may legitimately carry (packages/core owns the
// per-kind lists). Fastify parses only JSON and urlencoded out of the box, so
// PUT /documents/:id/content would answer 415 without these.
const UPLOAD_MIMES = [...new Set(Object.values(ALLOWED_MIMES).flat())];
// Fastify's default body limit is 1MB. Raise it for file bodies only — JSON
// stays capped at the default so this is not a general request-size increase.
const UPLOAD_BODY_LIMIT = MAX_FILE_SIZE_BYTES + 1024;

/** Shared by the long-running server (main.ts) and the serverless handler
 *  (serverless.ts) so middleware/CORS can never drift between the two. */
export async function createApp(): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ trustProxy: true }),
    { logger: ["error", "warn"] },
  );

  // Before Nest registers any route (that happens at init), so every route —
  // and the not-found handler — gets the request id and the log line.
  registerRequestLogging(app.getHttpAdapter().getInstance() as unknown as FastifyInstance);

  // Hand file bodies to controllers as a Buffer, untouched.
  app
    .getHttpAdapter()
    .getInstance()
    .addContentTypeParser(
      UPLOAD_MIMES,
      { parseAs: "buffer", bodyLimit: UPLOAD_BODY_LIMIT },
      (_req, body, done) => done(null, body),
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
