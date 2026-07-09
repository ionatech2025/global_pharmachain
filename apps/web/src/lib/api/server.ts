import "server-only";
import { cookies } from "next/headers";
import { API_URL } from "@/env";
import { type ApiClient, createApiClient } from "./http";

const SESSION_COOKIES = ["__Secure-authjs.session-token", "authjs.session-token"];

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
  return createApiClient(
    API_URL,
    (): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {}),
  );
}
