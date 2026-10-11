-- Lookup indexes for queries that scanned whole tables (2026-10 gap remediation).
-- Additive only: no column or constraint changes, so code that predates this
-- migration keeps working before and after it is applied.

-- RFQ / quotation / message attachments are loaded by these foreign keys;
-- Postgres does not index foreign keys on its own.
CREATE INDEX IF NOT EXISTS "Document_rfqId_idx" ON "Document"("rfqId");
CREATE INDEX IF NOT EXISTS "Document_quotationId_idx" ON "Document"("quotationId");
CREATE INDEX IF NOT EXISTS "Document_messageId_idx" ON "Document"("messageId");

-- The admin login-activity and audit-log pages list newest-first across all
-- rows; both tables only grow.
CREATE INDEX IF NOT EXISTS "LoginActivity_createdAt_idx" ON "LoginActivity"("createdAt");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
