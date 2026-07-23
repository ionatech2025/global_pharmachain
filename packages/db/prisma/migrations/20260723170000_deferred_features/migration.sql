-- WhatsApp challenge verification + TOTP second factor on users
ALTER TABLE "User" ADD COLUMN "whatsappVerifyCodeHash" TEXT;
ALTER TABLE "User" ADD COLUMN "whatsappVerifyExpiresAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "totpSecret" TEXT;
ALTER TABLE "User" ADD COLUMN "totpEnabledAt" TIMESTAMP(3);

-- Saved marketplace searches with new-match alerts
CREATE TABLE "SavedSearch" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "lastNotifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavedSearch_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SavedSearch_userId_idx" ON "SavedSearch"("userId");
ALTER TABLE "SavedSearch" ADD CONSTRAINT "SavedSearch_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Outbox for failed email/WhatsApp deliveries, retried with backoff
CREATE TABLE "NotificationOutbox" (
    "id" UUID NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL,
    "lastError" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationOutbox_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "NotificationOutbox_sentAt_nextAttemptAt_idx"
  ON "NotificationOutbox"("sentAt", "nextAttemptAt");
