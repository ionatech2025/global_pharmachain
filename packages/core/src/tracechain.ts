/**
 * Hash-chained traceability ledger (Phase 5 §2). Each event commits to its
 * payload and to the previous event's hash, so the whole history of an order
 * is tamper-evident: change any payload (or drop/reorder an event) and every
 * subsequent hash stops verifying. Combined with the DB-level append-only
 * trigger this gives blockchain-style integrity guarantees without the
 * operational weight of a distributed ledger — and the chain head can be
 * anchored externally at any time.
 */

export const TRACE_GENESIS = "0".repeat(64);

export interface TraceEventInput {
  seq: number;
  type: string;
  at: string; // ISO timestamp
  payloadHash: string;
  prevHash: string;
}

export interface TraceEventLike extends TraceEventInput {
  hash: string;
}

/** Stable stringify: sorted keys so hashes don't depend on insertion order. */
export function stablePayload(payload: unknown): string {
  return JSON.stringify(payload, (_key, value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)),
      );
    }
    return value;
  });
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function hashPayload(payload: unknown): Promise<string> {
  return sha256Hex(stablePayload(payload));
}

export function traceHash(event: TraceEventInput): Promise<string> {
  return sha256Hex(`${event.seq}|${event.type}|${event.at}|${event.payloadHash}|${event.prevHash}`);
}

export interface ChainVerification {
  valid: boolean;
  length: number;
  brokenAtSeq: number | null;
  reason: string | null;
}

/** Recomputes every link; any mismatch pinpoints the first broken event. */
export async function verifyChain(events: readonly TraceEventLike[]): Promise<ChainVerification> {
  let prevHash = TRACE_GENESIS;
  for (const [i, event] of events.entries()) {
    if (event.seq !== i + 1) {
      return {
        valid: false,
        length: events.length,
        brokenAtSeq: event.seq,
        reason: "sequence gap",
      };
    }
    if (event.prevHash !== prevHash) {
      return {
        valid: false,
        length: events.length,
        brokenAtSeq: event.seq,
        reason: "previous-hash mismatch",
      };
    }
    const expected = await traceHash(event);
    if (event.hash !== expected) {
      return {
        valid: false,
        length: events.length,
        brokenAtSeq: event.seq,
        reason: "hash mismatch",
      };
    }
    prevHash = event.hash;
  }
  return { valid: true, length: events.length, brokenAtSeq: null, reason: null };
}
