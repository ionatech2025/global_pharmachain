import { prisma } from "@pharmachain/db";
import type { AuditEntry } from "../lib/context";
import { logger } from "../lib/logger";

/** Direct audit writes for flows without an authenticated mutation context
 *  (registration, password reset) and for logged read access (US-503). */
export async function recordAudit(
  actor: { id: string; email: string },
  entry: AuditEntry & { ip?: string; userAgent?: string },
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorUserId: actor.id,
        actorEmail: actor.email,
        companyId: entry.companyId ?? null,
        action: entry.action,
        entityType: entry.entityType ?? null,
        entityId: entry.entityId ?? null,
        oldValues: entry.oldValues === undefined ? undefined : (entry.oldValues as object),
        newValues: entry.newValues === undefined ? undefined : (entry.newValues as object),
        reason: entry.reason ?? null,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ?? null,
      },
    });
  } catch (err) {
    logger.error("audit write failed", { error: String(err) });
  }
}
