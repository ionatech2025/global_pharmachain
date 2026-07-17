import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Observable } from "rxjs";
import { concatMap } from "rxjs/operators";
import { clientIp } from "../../lib/context";
import { writeAuditRow } from "../audit";

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Audit trail (US-903): every successful mutation is recorded. Controllers
 * enrich entries via setAudit(req, …); the route-level fallback guarantees
 * coverage. The write is awaited BEFORE the response is sent (durability
 * before acknowledgement, with one retry); a definitive audit failure is
 * logged but does not fail the already-committed mutation.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();

    return next.handle().pipe(
      concatMap(async (data) => {
        const user = req.user;
        if (!MUTATING.has(req.method) || reply.statusCode >= 400 || !user) return data;
        const entry = req.auditEntry;
        await writeAuditRow({
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
        });
        return data;
      }),
    );
  }
}
