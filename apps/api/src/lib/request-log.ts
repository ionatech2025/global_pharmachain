import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { logger } from "./logger";

/** What a caller-supplied id may look like (the web app sends UUIDs). Anything
 *  else — oversized, or carrying characters that could forge log fields — is
 *  replaced rather than echoed into headers and logs. */
const INCOMING_REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/;

/**
 * One structured "request" log line per request, written when the response
 * has actually been sent — so `status` is what the client received.
 *
 * This replaced a Nest interceptor (2026-11-12). Interceptors log too early
 * and too narrowly: the old one logged in RxJS `finalize`, before the
 * exception filter set the error status, so every 4xx/5xx thrown by a handler
 * was recorded as 200; and because Nest runs guards before interceptors,
 * requests refused by a guard (401/403/429) and unmatched routes (404) were
 * never logged at all. Fastify's own hooks see every request.
 *
 * The request id is assigned here, at the very start, so the exception
 * filter's log lines carry it even when a guard refuses the request.
 */
export function registerRequestLogging(fastify: FastifyInstance): void {
  fastify.addHook("onRequest", (req, reply, done) => {
    const incoming = req.headers["x-request-id"];
    const requestId =
      typeof incoming === "string" && INCOMING_REQUEST_ID.test(incoming) ? incoming : randomUUID();
    req.requestId = requestId;
    void reply.header("x-request-id", requestId);
    done();
  });

  fastify.addHook("onResponse", (req, reply, done) => {
    logger.info("request", {
      requestId: req.requestId,
      method: req.method,
      path: req.url,
      status: reply.statusCode,
      durationMs: Math.round(reply.elapsedTime),
      userId: req.user?.id,
    });
    done();
  });
}
