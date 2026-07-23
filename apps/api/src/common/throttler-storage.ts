import { Injectable, Logger, type OnApplicationShutdown } from "@nestjs/common";
import type { ThrottlerStorage } from "@nestjs/throttler";
import { ThrottlerStorageService } from "@nestjs/throttler";
import type { ThrottlerStorageRecord } from "@nestjs/throttler/dist/throttler-storage-record.interface";
import { prisma } from "@pharmachain/db";

/**
 * Long-window throttles (login, OTP, register, password reset — anything with
 * a ttl of 5 minutes or more) are abuse controls and must hold across
 * serverless instances, so they live in Postgres. The short-window default
 * (300/min burst shield) stays in the per-instance memory store: it is
 * best-effort by design, and a DB write per API request would cost more than
 * it protects.
 */
const SHARED_TTL_THRESHOLD_MS = 5 * 60_000;

interface BucketRow {
  count: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

@Injectable()
export class HybridThrottlerStorage implements ThrottlerStorage, OnApplicationShutdown {
  private readonly logger = new Logger(HybridThrottlerStorage.name);
  private readonly memory = new ThrottlerStorageService();

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    if (ttl < SHARED_TTL_THRESHOLD_MS) {
      return this.memory.increment(key, ttl, limit, blockDuration, throttlerName);
    }
    try {
      return await this.incrementShared(key, ttl, limit, blockDuration);
    } catch (err) {
      // Fail open to the per-instance store: refusing every login while the
      // database hiccups would be a worse failure mode, and the per-account
      // lockout (which shares the database's fate anyway) still applies.
      this.logger.error(`shared throttle unavailable, using in-memory fallback: ${err}`);
      return this.memory.increment(key, ttl, limit, blockDuration, throttlerName);
    }
  }

  /**
   * One atomic upsert mirroring ThrottlerStorageService semantics: an expired
   * window resets and counts the current hit; an active block neither counts
   * nor extends; an expired block resets the window and counts the current
   * hit; crossing the limit starts a block of `blockDuration`.
   */
  private async incrementShared(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
  ): Promise<ThrottlerStorageRecord> {
    const ttlSec = ttl / 1000;
    const blockSec = blockDuration / 1000;
    const rows = await prisma.$queryRaw<BucketRow[]>`
      INSERT INTO "ThrottleBucket" AS t ("key", "count", "expiresAt", "blockedUntil")
      VALUES (
        ${key},
        1,
        now() + make_interval(secs => ${ttlSec}),
        CASE WHEN 1 > ${limit} THEN now() + make_interval(secs => ${blockSec}) END
      )
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE
          WHEN t."blockedUntil" > now() THEN t."count"
          WHEN t."blockedUntil" <= now() OR t."expiresAt" <= now() THEN 1
          ELSE t."count" + 1
        END,
        "expiresAt" = CASE
          WHEN t."blockedUntil" > now() THEN t."expiresAt"
          WHEN t."blockedUntil" <= now() OR t."expiresAt" <= now()
            THEN now() + make_interval(secs => ${ttlSec})
          ELSE t."expiresAt"
        END,
        "blockedUntil" = CASE
          WHEN t."blockedUntil" > now() THEN t."blockedUntil"
          WHEN t."blockedUntil" <= now() THEN NULL
          WHEN t."expiresAt" <= now() THEN NULL
          WHEN t."count" + 1 > ${limit} THEN now() + make_interval(secs => ${blockSec})
          ELSE NULL
        END
      RETURNING
        "count",
        CEIL(GREATEST(EXTRACT(EPOCH FROM ("expiresAt" - now())), 0))::int AS "timeToExpire",
        ("blockedUntil" IS NOT NULL AND "blockedUntil" > now()) AS "isBlocked",
        COALESCE(CEIL(GREATEST(EXTRACT(EPOCH FROM ("blockedUntil" - now())), 0)), 0)::int
          AS "timeToBlockExpire"
    `;
    const row = rows[0];
    if (!row) throw new Error("throttle upsert returned no row");
    return {
      totalHits: row.count,
      timeToExpire: row.timeToExpire,
      isBlocked: row.isBlocked,
      timeToBlockExpire: row.timeToBlockExpire,
    };
  }

  onApplicationShutdown(): void {
    this.memory.onApplicationShutdown();
  }
}
