import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { logger } from "../../lib/logger";

/** Structured request logs with propagated request ids. */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();
    const requestId = (req.headers["x-request-id"] as string | undefined) ?? crypto.randomUUID();
    req.requestId = requestId;
    void reply.header("x-request-id", requestId);
    const start = performance.now();

    return next.handle().pipe(
      tap({
        finalize: () => {
          logger.info("request", {
            requestId,
            method: req.method,
            path: req.url,
            status: reply.statusCode,
            durationMs: Math.round(performance.now() - start),
            userId: req.user?.id,
          });
        },
      }),
    );
  }
}
