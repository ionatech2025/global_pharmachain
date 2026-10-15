-- Platform support issues & tickets (2026-10).
-- Additive and idempotent: new enums, tables, and indexes for raising and
-- triaging platform issues addressed by the development team.

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ISSUE_UPDATE';

DO $$ BEGIN
  CREATE TYPE "IssueCategory" AS ENUM ('BUG', 'FEATURE_REQUEST', 'ONBOARDING', 'VERIFICATION', 'BILLING', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "IssuePriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "SupportIssue" (
  "id" UUID NOT NULL,
  "refNo" TEXT NOT NULL,
  "companyId" UUID,
  "reportedById" UUID NOT NULL,
  "category" "IssueCategory" NOT NULL DEFAULT 'BUG',
  "priority" "IssuePriority" NOT NULL DEFAULT 'MEDIUM',
  "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',
  "subject" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "pageUrl" TEXT,
  "resolution" TEXT,
  "resolvedById" UUID,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SupportIssue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SupportIssueMessage" (
  "id" UUID NOT NULL,
  "issueId" UUID NOT NULL,
  "authorId" UUID NOT NULL,
  "isStaff" BOOLEAN NOT NULL DEFAULT false,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SupportIssueMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "SupportIssue_refNo_key" ON "SupportIssue"("refNo");
CREATE INDEX IF NOT EXISTS "SupportIssue_companyId_createdAt_idx" ON "SupportIssue"("companyId", "createdAt");
CREATE INDEX IF NOT EXISTS "SupportIssue_reportedById_createdAt_idx" ON "SupportIssue"("reportedById", "createdAt");
CREATE INDEX IF NOT EXISTS "SupportIssue_status_priority_createdAt_idx" ON "SupportIssue"("status", "priority", "createdAt");
CREATE INDEX IF NOT EXISTS "SupportIssueMessage_issueId_createdAt_idx" ON "SupportIssueMessage"("issueId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "SupportIssue"
    ADD CONSTRAINT "SupportIssue_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SupportIssue"
    ADD CONSTRAINT "SupportIssue_reportedById_fkey"
    FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SupportIssue"
    ADD CONSTRAINT "SupportIssue_resolvedById_fkey"
    FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SupportIssueMessage"
    ADD CONSTRAINT "SupportIssueMessage_issueId_fkey"
    FOREIGN KEY ("issueId") REFERENCES "SupportIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "SupportIssueMessage"
    ADD CONSTRAINT "SupportIssueMessage_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
