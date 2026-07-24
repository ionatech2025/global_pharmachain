import { describe, expect, test } from "bun:test";
import {
  hashPayload,
  stablePayload,
  TRACE_GENESIS,
  type TraceEventLike,
  traceHash,
  verifyChain,
} from "./tracechain";

async function buildChain(count: number): Promise<TraceEventLike[]> {
  const events: TraceEventLike[] = [];
  let prevHash = TRACE_GENESIS;
  for (let i = 1; i <= count; i += 1) {
    const payloadHash = await hashPayload({ step: i });
    const input = {
      seq: i,
      type: `event.${i}`,
      at: `2026-07-24T00:0${i}:00.000Z`,
      payloadHash,
      prevHash,
    };
    const hash = await traceHash(input);
    events.push({ ...input, hash });
    prevHash = hash;
  }
  return events;
}

describe("trace chain (Phase 5 §2)", () => {
  test("stable payload hashing ignores key order", async () => {
    expect(stablePayload({ b: 1, a: { d: 2, c: 3 } })).toBe(
      stablePayload({ a: { c: 3, d: 2 }, b: 1 }),
    );
    expect(await hashPayload({ x: 1 })).toBe(await hashPayload({ x: 1 }));
  });

  test("an intact chain verifies", async () => {
    const chain = await buildChain(5);
    const result = await verifyChain(chain);
    expect(result.valid).toBe(true);
    expect(result.length).toBe(5);
  });

  test("tampering with any payload breaks verification at that link", async () => {
    const chain = await buildChain(5);
    (chain[2] as TraceEventLike).payloadHash = await hashPayload({ step: "forged" });
    const result = await verifyChain(chain);
    expect(result.valid).toBe(false);
    expect(result.brokenAtSeq).toBe(3);
    expect(result.reason).toBe("hash mismatch");
  });

  test("dropping an event is detected as a sequence gap", async () => {
    const chain = await buildChain(4);
    chain.splice(1, 1);
    const result = await verifyChain(chain);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("sequence gap");
  });

  test("reordering breaks the previous-hash linkage", async () => {
    const chain = await buildChain(4);
    const [a, b] = [chain[1] as TraceEventLike, chain[2] as TraceEventLike];
    chain[1] = { ...b, seq: 2 };
    chain[2] = { ...a, seq: 3 };
    const result = await verifyChain(chain);
    expect(result.valid).toBe(false);
  });
});
