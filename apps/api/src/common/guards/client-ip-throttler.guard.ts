import { createHash, timingSafeEqual } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { env } from "../../env";
import { clientIp } from "../../lib/context";

/**
 * Rate limits keyed on the end-client IP, not the connecting socket.
 *
 * Browser logins reach the API via the web tier (Auth.js authorize() and the
 * /api/proxy route), so the default req.ip tracker would collapse every user
 * into the web server's single bucket — 20 failed logins by anyone would
 * lock the whole platform out. The web tier forwards the caller's address as
 * x-client-ip and proves it is the web tier with x-proxy-secret (the shared
 * AUTH_SECRET both deployments already hold).
 *
 * Without that proof the header is ignored — a direct caller spoofing
 * x-client-ip must not be able to rotate rate-limit buckets — and the tracker
 * falls back to platform-set forwarding headers (which Vercel normalizes to
 * the true client address). Credential endpoints are additionally protected
 * by the per-account lockout in AuthService, which no spoofed IP can bypass.
 */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const headers = (req.headers ?? {}) as Record<string, unknown>;
    const clientHeader = headers["x-client-ip"];
    if (
      isTrustedProxy(headers["x-proxy-secret"]) &&
      typeof clientHeader === "string" &&
      clientHeader.trim().length > 0
    ) {
      return clientHeader.trim();
    }
    return clientIp({ headers, ip: req.ip as string | undefined }) ?? "unknown";
  }
}

function isTrustedProxy(secret: unknown): boolean {
  if (typeof secret !== "string" || secret.length === 0) return false;
  // Hash both sides so the comparison is constant-time over equal lengths.
  const given = createHash("sha256").update(secret).digest();
  const expected = createHash("sha256").update(env.AUTH_SECRET).digest();
  return timingSafeEqual(given, expected);
}
