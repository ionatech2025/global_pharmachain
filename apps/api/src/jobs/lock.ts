import { prisma } from "@pharmachain/db";

// Generous ceiling — jobs are sweeps over bounded sets, not batch pipelines.
const JOB_LOCK_TIMEOUT_MS = 15 * 60 * 1000;

/**
 * Cross-instance mutual exclusion for scheduled jobs. Every replica may fire
 * the same cron; only the one that wins the Postgres advisory lock runs the
 * body, so notifications are sent exactly once per sweep regardless of how
 * many API instances (or the standalone worker) are deployed.
 *
 * The lock is transaction-scoped (pg_try_advisory_xact_lock) and held on the
 * transaction's dedicated connection for the duration of fn(); it releases
 * automatically on commit, rollback or connection loss — no unlock
 * bookkeeping, no stuck locks after a crash.
 *
 * Returns false when another instance holds the lock (the job is skipped).
 */
export async function withJobLock(name: string, fn: () => Promise<unknown>): Promise<boolean> {
  return prisma.$transaction(
    async (tx) => {
      const [{ locked }] = await tx.$queryRaw<[{ locked: boolean }]>`
        SELECT pg_try_advisory_xact_lock(hashtext(${name})::bigint) AS locked
      `;
      if (!locked) return false;
      await fn();
      return true;
    },
    { timeout: JOB_LOCK_TIMEOUT_MS, maxWait: 5_000 },
  );
}
