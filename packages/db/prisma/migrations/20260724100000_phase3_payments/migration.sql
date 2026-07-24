-- Phase 3 — Payments & Financial Tools (issue #2)
-- Payment tracking behind a gateway abstraction, per-company sequential
-- invoicing with HS-code tax/duty rules and FX stamping, append-only company
-- ledgers, live-FX source column, preferred display currency, AML/KYC review
-- fields and scheduled report delivery.

CREATE TYPE "PaymentMethod" AS ENUM ('BANK_TRANSFER', 'CARD', 'MOBILE_MONEY');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED', 'REFUNDED');
CREATE TYPE "InvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'PAID', 'VOID');
CREATE TYPE "LedgerEntryKind" AS ENUM (
  'INVOICE_ISSUED', 'INVOICE_RECEIVED', 'PAYMENT_IN', 'PAYMENT_OUT',
  'PLATFORM_FEE', 'CREDIT_PURCHASE'
);

ALTER TABLE "User" ADD COLUMN "preferredCurrency" TEXT;
ALTER TABLE "Company"
  ADD COLUMN "kycReviewedAt" TIMESTAMP(3),
  ADD COLUMN "kycRiskLevel" TEXT;
ALTER TABLE "ExchangeRate" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MANUAL';

CREATE TABLE "Payment" (
  "id" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "payerCompanyId" UUID NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "provider" TEXT NOT NULL,
  "providerRef" TEXT NOT NULL,
  "amount" DECIMAL(16,2) NOT NULL,
  "currency" TEXT NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "note" TEXT,
  "recordedById" UUID NOT NULL,
  "confirmedById" UUID,
  "confirmedAt" TIMESTAMP(3),
  "failureReason" TEXT,
  "webhookPayload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Payment_providerRef_key" ON "Payment"("providerRef");
CREATE INDEX "Payment_orderId_createdAt_idx" ON "Payment"("orderId", "createdAt");
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");
ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId")
    REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Payment_payerCompanyId_fkey" FOREIGN KEY ("payerCompanyId")
    REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Payment_recordedById_fkey" FOREIGN KEY ("recordedById")
    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "Invoice" (
  "id" UUID NOT NULL,
  "invoiceNo" TEXT NOT NULL,
  "seq" INTEGER NOT NULL,
  "issuerCompanyId" UUID NOT NULL,
  "recipientCompanyId" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "status" "InvoiceStatus" NOT NULL DEFAULT 'ISSUED',
  "lines" JSONB NOT NULL,
  "subtotal" DECIMAL(16,2) NOT NULL,
  "dutyAmount" DECIMAL(16,2) NOT NULL,
  "vatAmount" DECIMAL(16,2) NOT NULL,
  "total" DECIMAL(16,2) NOT NULL,
  "currency" TEXT NOT NULL,
  "hsCode" TEXT,
  "originCountry" TEXT,
  "destCountry" TEXT,
  "dutyRatePct" DECIMAL(6,3),
  "vatRatePct" DECIMAL(6,3),
  "fxRateToUsd" DECIMAL(16,8),
  "fxStampedAt" TIMESTAMP(3),
  "documentId" UUID,
  "issuedById" UUID NOT NULL,
  "paidAt" TIMESTAMP(3),
  "voidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Invoice_invoiceNo_key" ON "Invoice"("invoiceNo");
CREATE UNIQUE INDEX "Invoice_issuerCompanyId_seq_key" ON "Invoice"("issuerCompanyId", "seq");
CREATE INDEX "Invoice_recipientCompanyId_createdAt_idx" ON "Invoice"("recipientCompanyId", "createdAt");
CREATE INDEX "Invoice_orderId_idx" ON "Invoice"("orderId");
CREATE INDEX "Invoice_status_createdAt_idx" ON "Invoice"("status", "createdAt");
ALTER TABLE "Invoice"
  ADD CONSTRAINT "Invoice_issuerCompanyId_fkey" FOREIGN KEY ("issuerCompanyId")
    REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Invoice_recipientCompanyId_fkey" FOREIGN KEY ("recipientCompanyId")
    REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId")
    REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "Invoice_issuedById_fkey" FOREIGN KEY ("issuedById")
    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "LedgerEntry" (
  "id" UUID NOT NULL,
  "companyId" UUID NOT NULL,
  "kind" "LedgerEntryKind" NOT NULL,
  "amount" DECIMAL(16,2) NOT NULL,
  "currency" TEXT NOT NULL,
  "refType" TEXT NOT NULL,
  "refId" TEXT NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "LedgerEntry_companyId_createdAt_idx" ON "LedgerEntry"("companyId", "createdAt");
ALTER TABLE "LedgerEntry"
  ADD CONSTRAINT "LedgerEntry_companyId_fkey" FOREIGN KEY ("companyId")
    REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "TaxRule" (
  "id" UUID NOT NULL,
  "hsPrefix" TEXT NOT NULL,
  "originCountry" TEXT,
  "destCountry" TEXT NOT NULL,
  "dutyRatePct" DECIMAL(6,3) NOT NULL,
  "vatRatePct" DECIMAL(6,3) NOT NULL,
  "notes" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "updatedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TaxRule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TaxRule_destCountry_active_idx" ON "TaxRule"("destCountry", "active");

CREATE TABLE "ScheduledReport" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "report" TEXT NOT NULL,
  "frequency" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "lastSentAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScheduledReport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ScheduledReport_userId_report_key" ON "ScheduledReport"("userId", "report");
ALTER TABLE "ScheduledReport"
  ADD CONSTRAINT "ScheduledReport_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
