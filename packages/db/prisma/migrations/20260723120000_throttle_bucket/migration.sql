-- Shared rate-limit state for security-sensitive throttles (login, OTP,
-- register, password reset). Long-window limits must survive across serverless
-- instances; short-window burst limits remain in-memory.
CREATE TABLE "ThrottleBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "blockedUntil" TIMESTAMP(3),

    CONSTRAINT "ThrottleBucket_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "ThrottleBucket_expiresAt_idx" ON "ThrottleBucket"("expiresAt");
