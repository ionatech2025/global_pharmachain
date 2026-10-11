import { createHmac } from "node:crypto";

/**
 * The credential the web tier presents (x-proxy-secret) to prove the
 * client-identity headers it forwards are genuine. It used to be AUTH_SECRET
 * itself — the key that encrypts every session — sent on every proxied
 * request, so any log, trace or proxy that captured request headers captured
 * the power to forge sessions. Now it is a one-way derivative: proves the same
 * thing, unlocks nothing else.
 */
export function proxyIdentitySecret(authSecret: string): string {
  if (!authSecret) return "";
  return createHmac("sha256", authSecret).update("pharmachain/proxy-identity/v1").digest("hex");
}
