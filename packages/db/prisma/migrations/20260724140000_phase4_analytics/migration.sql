-- Phase 4 — Analytics, Mobile & Compliance (issue #3)
-- Ratings & trust system, Web Push subscriptions, customizable dashboards,
-- pharmacopoeia standards on listings, REACH/EHS compliance profile,
-- locale/timezone preferences, featured-placement + premium-verification
-- monetisation via the credit flow.

CREATE TYPE "RatingStatus" AS ENUM ('PUBLISHED', 'FLAGGED', 'REMOVED');
ALTER TYPE "CreditKind" ADD VALUE IF NOT EXISTS 'FEATURED';
ALTER TYPE "CreditKind" ADD VALUE IF NOT EXISTS 'VERIFICATION_PREMIUM';

ALTER TABLE "Company"
  ADD COLUMN "trustedBadgeAt" TIMESTAMP(3),
  ADD COLUMN "featuredUntil" TIMESTAMP(3),
  ADD COLUMN "reachStatus" TEXT,
  ADD COLUMN "ehsReport" TEXT;

ALTER TABLE "User"
  ADD COLUMN "locale" TEXT,
  ADD COLUMN "timeZone" TEXT;

ALTER TABLE "Listing" ADD COLUMN "standards" TEXT[] NOT NULL DEFAULT '{}';

CREATE TABLE "Rating" (
  "id" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "raterCompanyId" UUID NOT NULL,
  "targetCompanyId" UUID NOT NULL,
  "targetRole" TEXT NOT NULL,
  "stars" INTEGER NOT NULL,
  "comment" TEXT,
  "status" "RatingStatus" NOT NULL DEFAULT 'PUBLISHED',
  "flaggedReason" TEXT,
  "moderatedById" UUID,
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Rating_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Rating_orderId_raterCompanyId_targetCompanyId_key"
  ON "Rating"("orderId", "raterCompanyId", "targetCompanyId");
CREATE INDEX "Rating_targetCompanyId_status_idx" ON "Rating"("targetCompanyId", "status");
ALTER TABLE "Rating"
  ADD CONSTRAINT "Rating_orderId_fkey" FOREIGN KEY ("orderId")
    REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Rating_raterCompanyId_fkey" FOREIGN KEY ("raterCompanyId")
    REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Rating_targetCompanyId_fkey" FOREIGN KEY ("targetCompanyId")
    REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Rating_createdById_fkey" FOREIGN KEY ("createdById")
    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "PushSubscription" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "userAgent" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");
ALTER TABLE "PushSubscription"
  ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "DashboardPreference" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "widgets" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DashboardPreference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DashboardPreference_userId_key" ON "DashboardPreference"("userId");
ALTER TABLE "DashboardPreference"
  ADD CONSTRAINT "DashboardPreference_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
