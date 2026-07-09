// API-safe session decoding: this module must not import "next-auth"
// (the API runs on Bun without Next). Import it via "@pharmachain/auth/session".
import { decode, type JWT } from "@auth/core/jwt";
import type { AuthenticatedUser } from "./contracts";

// Auth.js derives the JWE key from AUTH_SECRET + a salt equal to the cookie
// name, which differs between plain-HTTP dev and HTTPS production. Trying both
// keeps one decode helper correct in every deployment.
const COOKIE_SALTS = ["authjs.session-token", "__Secure-authjs.session-token"] as const;

export type SessionTokenPayload = JWT & {
  sub?: string;
  sv?: number;
  user?: Pick<AuthenticatedUser, "email" | "name" | "isSuperAdmin">;
};

export async function decodeSessionToken(
  token: string,
  secret: string,
): Promise<SessionTokenPayload | null> {
  for (const salt of COOKIE_SALTS) {
    try {
      const payload = await decode<SessionTokenPayload>({ token, secret, salt });
      if (payload) return payload;
    } catch {
      // wrong salt or tampered token — try the next salt
    }
  }
  return null;
}

export const SESSION_COOKIE_NAMES = COOKIE_SALTS;
