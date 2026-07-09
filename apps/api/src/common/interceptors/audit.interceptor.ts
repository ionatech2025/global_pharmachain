import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import { prisma } from "@pharmachain/db";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { clientIp } from "../../lib/context";
import { logger } from "../../lib/logger";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Immutable audit trail (US-903): every successful mutation is recorded.
 * Controllers enrich entries via setAudit(req, …); the route-level fallback
 * guarantees coverage. Writes happen after the response, never failing it.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();

    return next.handle().pipe(
      tap(() => {
        const user = req.user;
        if (!MUTATING.has(req.method) || reply.statusCode >= 400 || !user) return;
        const entry = req.auditEntry;
        prisma.auditLog
          .create({
            data: {
              actorUserId: user.id,
              actorEmail: user.email,
              companyId: entry?.companyId ?? req.membership?.companyId ?? null,
              action: entry?.action ?? `${req.method} ${req.routeOptions?.url ?? req.url}`,
              entityType: entry?.entityType ?? null,
              entityId: entry?.entityId ?? null,
              oldValues: entry?.oldValues === undefined ? undefined : (entry.oldValues as object),
              newValues: entry?.newValues === undefined ? undefined : (entry.newValues as object),
              reason: entry?.reason ?? null,
              ip: clientIp(req) ?? null,
              userAgent: (req.headers["user-agent"] as string | undefined) ?? null,
            },
          })
          .catch((err) => {
            logger.error("audit write failed", { requestId: req.requestId, error: String(err) });
          });
      }),
    );
  }
}
