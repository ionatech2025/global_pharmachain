import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { clientIp } from "../../lib/context";

/**
 * Rate limits keyed on the end-client IP, not the connecting socket.
 *
 * Browser logins reach the API via the web tier (Auth.js authorize() and the
 * /api/proxy route), so the default req.ip tracker would collapse every user
 * into the web server's single bucket — 20 failed logins by anyone would
 * lock the whole platform out. The web tier forwards the caller's address as
 * x-client-ip / x-forwarded-for; we key on that chain instead.
 *
 * These headers are only trustworthy when the API is not directly reachable
 * from the internet (see README deployment notes). Credential endpoints are
 * additionally protected by the per-account lockout in AuthService, which a
 * spoofed IP cannot bypass.
 */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Record<string, unknown>): Promise<string> {
    const headers = (req.headers ?? {}) as Record<string, unknown>;
    const clientHeader = headers["x-client-ip"];
    if (typeof clientHeader === "string" && clientHeader.trim().length > 0) {
      return clientHeader.trim();
    }
    return clientIp({ headers, ip: req.ip as string | undefined }) ?? "unknown";
  }
}
