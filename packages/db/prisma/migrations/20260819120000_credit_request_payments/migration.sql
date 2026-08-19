-- In-platform settlement for platform fees (credit / featured / verification
-- purchases). Purely additive: every column is nullable, so existing rows and
-- the manual admin-confirmation path are unaffected.
ALTER TABLE "CreditRequest" ADD COLUMN "paymentMethod" "PaymentMethod";
ALTER TABLE "CreditRequest" ADD COLUMN "paymentProvider" TEXT;
ALTER TABLE "CreditRequest" ADD COLUMN "paymentRef" TEXT;
ALTER TABLE "CreditRequest" ADD COLUMN "paymentInstructions" TEXT;
ALTER TABLE "CreditRequest" ADD COLUMN "paymentInitiatedAt" TIMESTAMP(3);
ALTER TABLE "CreditRequest" ADD COLUMN "webhookPayload" JSONB;

-- The provider webhook resolves a request by this reference, so it must be
-- unique across the table. NULLs do not collide in a Postgres unique index.
CREATE UNIQUE INDEX "CreditRequest_paymentRef_key" ON "CreditRequest"("paymentRef");
