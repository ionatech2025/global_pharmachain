-- Phase 5 — Intelligence & Marketplace Scale (issue #4)
-- Hash-chained traceability ledger (immutable via trigger), partner webhooks
-- with signed retried deliveries, scoped rate-limited API keys, data-insights
-- subscription window, escrow method and invoice credit terms.

ALTER TYPE "CreditKind" ADD VALUE IF NOT EXISTS 'DATA_INSIGHTS';
ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'ESCROW';

ALTER TABLE "Company" ADD COLUMN "insightsUntil" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN "paymentTermsDays" INTEGER;

CREATE TABLE "TraceEvent" (
  "id" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "seq" INTEGER NOT NULL,
  "type" TEXT NOT NULL,
  "at" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "prevHash" TEXT NOT NULL,
  "hash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TraceEvent_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TraceEvent_orderId_seq_key" ON "TraceEvent"("orderId", "seq");
CREATE INDEX "TraceEvent_orderId_idx" ON "TraceEvent"("orderId");
CREATE INDEX "TraceEvent_hash_idx" ON "TraceEvent"("hash");
ALTER TABLE "TraceEvent"
  ADD CONSTRAINT "TraceEvent_orderId_fkey" FOREIGN KEY ("orderId")
    REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Immutable audit-ledger semantics: same defence-in-depth trigger pattern as
-- AuditLog — no role, including the table owner, can rewrite history.
CREATE OR REPLACE FUNCTION trace_event_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'TraceEvent rows are immutable (append-only ledger)';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER trace_event_no_update_delete
  BEFORE UPDATE OR DELETE ON "TraceEvent"
  FOR EACH ROW EXECUTE FUNCTION trace_event_immutable();

CREATE TABLE "Webhook" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "url" TEXT NOT NULL,
  "secret" TEXT NOT NULL,
  "events" TEXT[] NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "failCount" INTEGER NOT NULL DEFAULT 0,
  "lastSuccessAt" TIMESTAMP(3),
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Webhook_companyId_idx" ON "Webhook"("companyId");
ALTER TABLE "Webhook"
  ADD CONSTRAINT "Webhook_companyId_fkey" FOREIGN KEY ("companyId")
    REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "WebhookDelivery" (
  "id" UUID NOT NULL,
  "webhookId" UUID NOT NULL,
  "event" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt" TIMESTAMP(3),
  "lastStatus" INTEGER,
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "WebhookDelivery_deliveredAt_nextAttemptAt_idx"
  ON "WebhookDelivery"("deliveredAt", "nextAttemptAt");
CREATE INDEX "WebhookDelivery_webhookId_createdAt_idx"
  ON "WebhookDelivery"("webhookId", "createdAt");
ALTER TABLE "WebhookDelivery"
  ADD CONSTRAINT "WebhookDelivery_webhookId_fkey" FOREIGN KEY ("webhookId")
    REFERENCES "Webhook"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ApiKey" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "prefix" TEXT NOT NULL,
  "hashedKey" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL,
  "rateLimitPerMin" INTEGER NOT NULL DEFAULT 60,
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ApiKey_hashedKey_key" ON "ApiKey"("hashedKey");
CREATE INDEX "ApiKey_companyId_idx" ON "ApiKey"("companyId");
ALTER TABLE "ApiKey"
  ADD CONSTRAINT "ApiKey_companyId_fkey" FOREIGN KEY ("companyId")
    REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
