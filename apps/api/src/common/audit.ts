import type { Prisma } from "@pharmachain/db";
import { prisma } from "@pharmachain/db";
import type { AuditEntry } from "../lib/context";
import { logger } from "../lib/logger";

/**
 * Single write path for the audit trail (US-903). One immediate retry covers
 * transient failures; a definitive failure is logged loudly but never breaks
 * the mutation it describes — the trade-off is documented in the README
 * (strict "no audit row, no response" would let an audit-table outage take
 * every mutation down with it).
 */
export async function writeAuditRow(data: Prisma.AuditLogUncheckedCreateInput): Promise<void> {
  try {
    await prisma.auditLog.create({ data });
  } catch (firstErr) {
    logger.warn("audit write failed, retrying once", {
      action: data.action,
      error: String(firstErr),
    });
    try {
      await prisma.auditLog.create({ data });
    } catch (err) {
      logger.error("audit write failed permanently", { action: data.action, error: String(err) });
    }
  }
}

/** Direct audit writes for flows without an authenticated mutation context
 *  (registration, password reset) and for logged read access (US-503). */
export async function recordAudit(
  actor: { id: string; email: string },
  entry: AuditEntry & { ip?: string; userAgent?: string },
): Promise<void> {
  await writeAuditRow({
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
  });
}
