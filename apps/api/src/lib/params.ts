import { type ParamKey, paramDefinition, parseCsvInts } from "@pharmachain/core";
import { prisma } from "@pharmachain/db";

// System parameters change rarely; a 60s cache keeps hot paths off the table.
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { value: string; at: number }>();

export async function getParam(key: ParamKey): Promise<string> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const row = await prisma.systemParameter.findUnique({ where: { key } });
  const value = row?.value ?? paramDefinition(key).defaultValue;
  cache.set(key, { value, at: Date.now() });
  return value;
}

export async function getIntParam(key: ParamKey): Promise<number> {
  return Number.parseInt(await getParam(key), 10);
}

export async function getCsvIntParam(key: ParamKey): Promise<number[]> {
  return parseCsvInts(await getParam(key));
}

export function invalidateParamCache(): void {
  cache.clear();
}
