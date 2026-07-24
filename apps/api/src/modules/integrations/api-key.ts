import { createHash, randomBytes } from "node:crypto";
import type { ApiScope } from "@pharmachain/core";
import { prisma } from "@pharmachain/db";
import type { FastifyRequest } from "fastify";
import { ApiException } from "../../common/errors";
import { defer } from "../../lib/defer";

/**
 * Partner/public API keys (Phase 5 §4): `pck_live_<40 hex>` shown once at
 * creation; only the SHA-256 lands in the database. Every call is scoped and
 * rate-limited per key through the durable ThrottleBucket table, so limits
 * hold across serverless instances.
 */

export function generateApiKey(): { token: string; prefix: string; hashedKey: string } {
  const token = `pck_live_${randomBytes(20).toString("hex")}`;
  return { token, prefix: token.slice(0, 14), hashedKey: hashApiKey(token) };
}

export function hashApiKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export interface ApiKeyContext {
  keyId: string;
  companyId: string;
  scopes: string[];
}

export async function authenticateApiKey(
  req: FastifyRequest,
  requiredScope: ApiScope,
): Promise<ApiKeyContext> {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token.startsWith("pck_")) {
    throw new ApiException(
      401,
      "API_KEY_REQUIRED",
      "Provide an API key: Authorization: Bearer pck_…",
    );
  }
  const key = await prisma.apiKey.findUnique({ where: { hashedKey: hashApiKey(token) } });
  if (!key || key.revokedAt) {
    throw new ApiException(401, "API_KEY_INVALID", "Unknown or revoked API key");
  }
  if (!key.scopes.includes(requiredScope)) {
    throw new ApiException(403, "API_SCOPE_MISSING", `This key lacks the ${requiredScope} scope`);
  }
  // Durable per-key per-minute rate limit (Phase 5 §4).
  const windowMs = 60_000;
  const bucketKey = `apikey:${key.id}`;
  const now = new Date();
  const rows = await prisma.$queryRaw<Array<{ count: number; expiresAt: Date }>>`
    INSERT INTO "ThrottleBucket" ("key", "count", "expiresAt")
    VALUES (${bucketKey}, 1, ${new Date(now.getTime() + windowMs)})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "ThrottleBucket"."expiresAt" <= ${now} THEN 1
                     ELSE "ThrottleBucket"."count" + 1 END,
      "expiresAt" = CASE WHEN "ThrottleBucket"."expiresAt" <= ${now}
                         THEN ${new Date(now.getTime() + windowMs)}
                         ELSE "ThrottleBucket"."expiresAt" END
    RETURNING "count", "expiresAt"
  `;
  const bucket = rows[0];
  if (bucket && bucket.count > key.rateLimitPerMin) {
    throw new ApiException(429, "RATE_LIMITED", "API key rate limit exceeded — retry shortly");
  }
  // Best-effort usage stamp (at most once a minute per key).
  if (!key.lastUsedAt || now.getTime() - key.lastUsedAt.getTime() > windowMs) {
    defer(prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: now } }));
  }
  return { keyId: key.id, companyId: key.companyId, scopes: key.scopes };
}
