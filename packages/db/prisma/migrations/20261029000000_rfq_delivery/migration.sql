-- RFQ delivery (2026-10-29): record who each RFQ was provided to, deliver it to
-- them, and date every amendment. Additive only.
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'NEW_RFQ';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'QUOTATION_RECEIPT';

ALTER TABLE "Rfq" ADD COLUMN "distributedAt" TIMESTAMP(3);

-- Every RFQ that already exists was visible in supplier inboxes from the day it
-- was raised. Mark it delivered, or the first delivery sweep after release would
-- announce every historical RFQ to every eligible supplier at once.
UPDATE "Rfq" SET "distributedAt" = "createdAt" WHERE "distributedAt" IS NULL;

-- CreateTable
CREATE TABLE "RfqDistribution" (
    "id" UUID NOT NULL,
    "rfqId" UUID NOT NULL,
    "companyId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "deliveredAt" TIMESTAMP(3),

    CONSTRAINT "RfqDistribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RfqAmendment" (
    "id" UUID NOT NULL,
    "rfqId" UUID NOT NULL,
    "createdById" UUID NOT NULL,
    "note" TEXT NOT NULL,
    "previousDeadline" TIMESTAMP(3) NOT NULL,
    "newDeadline" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RfqAmendment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RfqDistribution_companyId_deliveredAt_idx" ON "RfqDistribution"("companyId", "deliveredAt");

-- CreateIndex
CREATE UNIQUE INDEX "RfqDistribution_rfqId_companyId_key" ON "RfqDistribution"("rfqId", "companyId");

-- CreateIndex
CREATE INDEX "RfqAmendment_rfqId_createdAt_idx" ON "RfqAmendment"("rfqId", "createdAt");

-- CreateIndex
CREATE INDEX "Rfq_distributedAt_idx" ON "Rfq"("distributedAt");

-- AddForeignKey
ALTER TABLE "RfqDistribution" ADD CONSTRAINT "RfqDistribution_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqDistribution" ADD CONSTRAINT "RfqDistribution_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqAmendment" ADD CONSTRAINT "RfqAmendment_rfqId_fkey" FOREIGN KEY ("rfqId") REFERENCES "Rfq"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RfqAmendment" ADD CONSTRAINT "RfqAmendment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

