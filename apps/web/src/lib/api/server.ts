import "server-only";
import { proxyIdentitySecret } from "@pharmachain/auth/proxy-secret";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { API_URL } from "@/env";
import { loginUrlFor } from "@/lib/callback-url";
import { type ApiClient, ApiClientError, createApiClient } from "./http";

const SESSION_COOKIES = ["__Secure-authjs.session-token", "authjs.session-token"];

/** US-204: a 403 during server rendering lands on a clear not-authorised
 *  screen instead of the generic error boundary. A 401 — the session died
 *  server-side (expired, revoked, sessionVersion bumped) between page
 *  loads — sends the visitor back to sign in instead of the generic error
 *  boundary too; the live idle-timeout case is handled client-side and
 *  never reaches this guard. */
function withAuthRedirects(client: ApiClient): ApiClient {
  const guard = async <T>(run: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 403) redirect("/forbidden");
        if (err.status === 401) redirect(await loginRedirectPath());
      }
      throw err;
    }
  };
  return {
    get: (path, opts) => guard(() => client.get(path, opts)),
    post: (path, body, opts) => guard(() => client.post(path, body, opts)),
    put: (path, body, opts) => guard(() => client.put(path, body, opts)),
    patch: (path, body, opts) => guard(() => client.patch(path, body, opts)),
    delete: (path, opts) => guard(() => client.delete(path, opts)),
  };
}

/** /login for a visitor whose session is missing or dead, carrying the page
 *  they asked for — notification emails deep-link to orders, RFQs and
 *  threads, and a lapsed session used to land them on the dashboard instead. */
export async function loginRedirectPath(): Promise<string> {
  return loginUrlFor((await headers()).get("x-pathname"));
}

/** One id per page render, shared by every API call it makes, so the API's
 *  request logs for a slow or failing page can be found together. */
const renderRequestId = cache(() => crypto.randomUUID());

/**
 * Server-side API client (RSC + server actions). Forwards the raw Auth.js
 * session JWE as a Bearer token — the API decodes and revalidates it.
 *
 * Also forwards who is actually asking, the same way the browser proxy does.
 * Without it every server-rendered call reached the API from this function's
 * own egress address, so per-client rate limits pooled every visitor into one
 * bucket and nothing downstream could tell users apart. x-proxy-secret proves
 * the identity headers come from the web tier; the API ignores them otherwise.
 */
export async function apiServer(): Promise<ApiClient> {
  const [store, incoming] = await Promise.all([cookies(), headers()]);
  let token: string | undefined;
  for (const name of SESSION_COOKIES) {
    token = store.get(name)?.value;
    if (token) break;
  }
  const forwardedFor = incoming.get("x-forwarded-for") ?? "";
  const identity: Record<string, string> = {
    "x-forwarded-for": forwardedFor,
    "x-client-ip": forwardedFor.split(",")[0]?.trim() ?? "",
    "x-client-user-agent": incoming.get("user-agent") ?? "",
    "x-proxy-secret": proxyIdentitySecret(process.env.AUTH_SECRET ?? ""),
    "x-request-id": renderRequestId(),
  };
  return withAuthRedirects(
    createApiClient(
      API_URL,
      (): Record<string, string> => ({
        ...identity,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      }),
    ),
  );
}

import type { AuthenticatedUser } from "@pharmachain/auth";

/**
 * Request-deduplicated viewer identity (review finding: /auth/me was fetched
 * 2–4× per request by layout, pages and panels). React cache() memoises per
 * RSC render; every server component shares one API call.
 */
export const getViewer = cache(async (): Promise<AuthenticatedUser> => {
  const api = await apiServer();
  return api.get<AuthenticatedUser>("/auth/me");
});
