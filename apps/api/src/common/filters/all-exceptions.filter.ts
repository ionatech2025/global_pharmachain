import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../../lib/logger";

interface ErrorEnvelope {
  error: { code: string; message: string; details?: unknown };
}

function isEnvelope(value: unknown): value is ErrorEnvelope {
  return typeof value === "object" && value !== null && "error" in value;
}

/** Normalises every failure to the { error: { code, message, details } }
 *  envelope the web client expects. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      const body: ErrorEnvelope = isEnvelope(response)
        ? response
        : {
            error: {
              code: status === 429 ? "RATE_LIMITED" : `HTTP_${status}`,
              message:
                typeof response === "string"
                  ? response
                  : ((response as { message?: string | string[] }).message?.toString() ??
                    exception.message),
            },
          };
      void reply.status(status).send(body);
      return;
    }

    logger.error("unhandled error", {
      path: request.url,
      error: exception instanceof Error ? exception.message : String(exception),
      stack: exception instanceof Error ? exception.stack : undefined,
    });
    void reply.status(500).send({ error: { code: "INTERNAL", message: "Internal server error" } });
  }
}
