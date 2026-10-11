import "server-only";
import { cache } from "react";
import { API_URL } from "@/env";
import { ApiClientError } from "./http";
import type { CategoryRow, ExchangeRateRow } from "./types";

/**
 * Catalogue reference data — categories and display FX rates. Identical for
 * every viewer and slow to change, so it is fetched WITHOUT credentials (the
 * API serves it publicly) and held in Next's shared data cache: one copy for
 * all users, refreshed every five minutes, instead of two authenticated API
 * round trips in every marketplace and catalogue render.
 */
const REVALIDATE_SECONDS = 300;

async function getReference<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    next: { revalidate: REVALIDATE_SECONDS, tags: [`reference:${path}`] },
  });
  if (!res.ok) {
    throw new ApiClientError(res.status, "ERROR", `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
}

export const getCategories = cache(() => getReference<CategoryRow[]>("/catalogue/categories"));

export const getExchangeRates = cache(() =>
  getReference<ExchangeRateRow[]>("/catalogue/exchange-rates"),
);
