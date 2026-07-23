import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { AuthenticatedUser } from "./contracts";
import "./types";

export type { AuthenticatedUser } from "./contracts";

// 30-minute idle timeout (US-205). Sessions roll only while the client's
// activity-gated keepalive refreshes them — see SessionKeepalive in the web app.
export const SESSION_MAX_AGE_SECONDS = 30 * 60;
export const SESSION_UPDATE_AGE_SECONDS = 5 * 60;
export const IDLE_WARNING_AFTER_SECONDS = 25 * 60;

async function verifyWithApi(
  apiUrl: string,
  body: Record<string, unknown>,
  request?: Request,
): Promise<AuthenticatedUser | null> {
  try {
    const forwardedFor = request?.headers.get("x-forwarded-for") ?? "";
    const res = await fetch(`${apiUrl}/auth/login`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Forwarded so the API's login-activity audit AND its rate limiter see
        // the real client — without this every browser login shares the web
        // server's IP bucket and the platform-wide login throttle trips.
        // x-proxy-secret proves these identity headers come from the web tier;
        // the API ignores x-client-ip from anyone who cannot present it.
        "x-forwarded-for": forwardedFor,
        "x-client-ip": forwardedFor.split(",")[0]?.trim() ?? "",
        "x-proxy-secret": process.env.AUTH_SECRET ?? "",
        "x-client-user-agent": request?.headers.get("user-agent") ?? "",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as AuthenticatedUser;
  } catch {
    return null;
  }
}

export function createAuthConfig(opts: { apiUrl: string }): NextAuthConfig {
  return {
    trustHost: true,
    session: {
      strategy: "jwt",
      maxAge: SESSION_MAX_AGE_SECONDS,
      updateAge: SESSION_UPDATE_AGE_SECONDS,
    },
    pages: { signIn: "/login" },
    providers: [
      Credentials({
        id: "credentials",
        name: "Email and password",
        credentials: { email: {}, password: {}, totpCode: {} },
        authorize: async (credentials, request) => {
          const { email, password, totpCode } = credentials as {
            email?: string;
            password?: string;
            totpCode?: string;
          };
          if (!email || !password) return null;
          return verifyWithApi(
            opts.apiUrl,
            totpCode ? { email, password, totpCode } : { email, password },
            request,
          );
        },
      }),
      Credentials({
        id: "otp",
        name: "One-time code",
        credentials: { email: {}, otp: {} },
        authorize: async (credentials, request) => {
          const { email, otp } = credentials as { email?: string; otp?: string };
          if (!email || !otp) return null;
          return verifyWithApi(opts.apiUrl, { email, otp }, request);
        },
      }),
    ],
    callbacks: {
      jwt({ token, user }) {
        if (user) {
          const u = user as unknown as AuthenticatedUser;
          token.sub = u.id;
          token.sv = u.sessionVersion;
          token.user = { email: u.email, name: u.name, isSuperAdmin: u.isSuperAdmin };
          token.membership = u.membership;
        }
        return token;
      },
      session({ session, token }) {
        session.user.id = token.sub ?? "";
        session.user.isSuperAdmin = token.user?.isSuperAdmin ?? false;
        session.user.membership = token.membership ?? null;
        if (token.user) {
          session.user.email = token.user.email;
          session.user.name = token.user.name;
        }
        return session;
      },
    },
  };
}
