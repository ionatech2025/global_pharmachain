-- P0 remediation: per-job freshness heartbeats (architecture review finding 01)
CREATE TABLE "JobHeartbeat" (
  "name" TEXT NOT NULL,
  "lastRunAt" TIMESTAMP(3) NOT NULL,
  "lastOkAt" TIMESTAMP(3),
  "lastError" TEXT,
  "durationMs" INTEGER,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JobHeartbeat_pkey" PRIMARY KEY ("name")
);
