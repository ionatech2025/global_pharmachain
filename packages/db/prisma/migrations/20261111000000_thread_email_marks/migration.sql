-- Message email throttle per recipient (US-603, client review 2026-11-11).
-- The single per-thread marker (MessageThread.lastEmailNotifiedAt) let a
-- party's own message use up the 10-minute window, so replies addressed to
-- them were never emailed. One marker per (thread, recipient company) instead.
-- Additive only; the old column stays until builds that select it are gone.

-- CreateTable
CREATE TABLE "MessageThreadEmailMark" (
    "threadId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "lastEmailedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageThreadEmailMark_pkey" PRIMARY KEY ("threadId","companyId")
);

-- AddForeignKey
ALTER TABLE "MessageThreadEmailMark" ADD CONSTRAINT "MessageThreadEmailMark_threadId_fkey" FOREIGN KEY ("threadId") REFERENCES "MessageThread"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageThreadEmailMark" ADD CONSTRAINT "MessageThreadEmailMark_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
