import type { Prisma } from "@pharmachain/db";

/** US-603: at most one email per thread per recipient company per 10 minutes. */
export const EMAIL_THROTTLE_MS = 10 * 60 * 1000;

type MarkStore = Pick<Prisma.TransactionClient, "messageThreadEmailMark">;

/**
 * Claims the email window on `threadId` for each recipient company and returns
 * the ones that won — those are emailed about this message; the rest get it
 * in-app only, because they were emailed about this conversation less than
 * EMAIL_THROTTLE_MS ago.
 *
 * The window belongs to the RECIPIENT. It used to be one marker per thread, so
 * a message sent BY a company used up the window for messages sent TO it: in
 * production (2026-11-10) one side wrote at 10:05, the other replied six times
 * between 10:07 and 10:10, and none of those six was emailed (client review,
 * 2026-11-11, US-603 TC-2).
 *
 * Race-safe inside the caller's transaction: a first message inserts the mark
 * (a concurrent insert of the same key waits on the primary key and then
 * skips); later ones move it only if it is older than the window (a concurrent
 * update re-reads the row after the winner commits and no longer matches).
 */
export async function claimEmailWindows(
  db: MarkStore,
  threadId: string,
  companyIds: readonly string[],
  now: Date,
): Promise<Set<string>> {
  const cutoff = new Date(now.getTime() - EMAIL_THROTTLE_MS);
  const won = new Set<string>();
  for (const companyId of new Set(companyIds)) {
    const created = await db.messageThreadEmailMark.createMany({
      data: [{ threadId, companyId, lastEmailedAt: now }],
      skipDuplicates: true,
    });
    if (created.count === 1) {
      won.add(companyId);
      continue;
    }
    const moved = await db.messageThreadEmailMark.updateMany({
      where: { threadId, companyId, lastEmailedAt: { lte: cutoff } },
      data: { lastEmailedAt: now },
    });
    if (moved.count === 1) won.add(companyId);
  }
  return won;
}
