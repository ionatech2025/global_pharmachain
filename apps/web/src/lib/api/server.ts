import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { API_URL } from "@/env";
import { type ApiClient, ApiClientError, createApiClient } from "./http";

const SESSION_COOKIES = ["__Secure-authjs.session-token", "authjs.session-token"];

/** US-204: a 403 during server rendering lands on a clear not-authorised
 *  screen instead of the generic error boundary. */
function withForbiddenRedirect(client: ApiClient): ApiClient {
  const guard = async <T>(run: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 403) redirect("/forbidden");
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

/**
 * Server-side API client (RSC + server actions). Forwards the raw Auth.js
 * session JWE as a Bearer token — the API decodes and revalidates it.
 */
export async function apiServer(): Promise<ApiClient> {
  const store = await cookies();
  let token: string | undefined;
  for (const name of SESSION_COOKIES) {
    token = store.get(name)?.value;
    if (token) break;
  }
  return withForbiddenRedirect(
    createApiClient(
      API_URL,
      (): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {}),
    ),
  );
}

import type { AuthenticatedUser } from "@pharmachain/auth";
import { cache } from "react";

/**
 * Request-deduplicated viewer identity (review finding: /auth/me was fetched
 * 2–4× per request by layout, pages and panels). React cache() memoises per
 * RSC render; every server component shares one API call.
 */
export const getViewer = cache(async (): Promise<AuthenticatedUser> => {
  const api = await apiServer();
  return api.get<AuthenticatedUser>("/auth/me");
});
