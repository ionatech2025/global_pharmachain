import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException } from "@nestjs/common";
import { Prisma } from "@pharmachain/db";
import type { FastifyReply, FastifyRequest } from "fastify";
import { logger } from "../../lib/logger";

interface ErrorEnvelope {
  error: { code: string; message: string; details?: unknown };
}

// Only OUR envelope qualifies: `error` must be an object carrying a `code`.
// Nest's built-in exceptions (router 404, bare ForbiddenException, …) use
// `{ statusCode, message, error: "Not Found" }` where `error` is a string —
// those must be reformatted into our shape, not passed through.
function isEnvelope(value: unknown): value is ErrorEnvelope {
  if (typeof value !== "object" || value === null || !("error" in value)) return false;
  const inner = (value as { error: unknown }).error;
  return typeof inner === "object" && inner !== null && "code" in inner;
}

/**
 * Several flows lean on database constraints as the final concurrency guard
 * (duplicate registration, quotation races, thread get-or-create). Those must
 * surface as client errors, not 500s.
 */
function mapPrismaError(
  err: Prisma.PrismaClientKnownRequestError,
): { status: number; body: ErrorEnvelope } | null {
  switch (err.code) {
    case "P2002": {
      const target = Array.isArray(err.meta?.target) ? err.meta.target.join(", ") : undefined;
      return {
        status: 409,
        body: {
          error: {
            code: "CONFLICT",
            message: "This record conflicts with one that already exists",
            details: target ? { fields: target } : undefined,
          },
        },
      };
    }
    case "P2025":
      return {
        status: 404,
        body: { error: { code: "NOT_FOUND", message: "Not found" } },
      };
    // Serializable-transaction write conflict — the request is safe to retry.
    case "P2034":
      return {
        status: 409,
        body: {
          error: {
            code: "CONFLICT",
            message: "The operation conflicted with a concurrent request — please retry",
          },
        },
      };
    default:
      return null;
  }
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

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const mapped = mapPrismaError(exception);
      if (mapped) {
        logger.warn("prisma constraint surfaced to client", {
          requestId: request.requestId,
          path: request.url,
          code: exception.code,
        });
        void reply.status(mapped.status).send(mapped.body);
        return;
      }
    }

    logger.error("unhandled error", {
      path: request.url,
      error: exception instanceof Error ? exception.message : String(exception),
      stack: exception instanceof Error ? exception.stack : undefined,
    });
    void reply.status(500).send({ error: { code: "INTERNAL", message: "Internal server error" } });
  }
}
