import { describe, expect, test } from "bun:test";
import { claimEmailWindows, EMAIL_THROTTLE_MS } from "./throttle";

/** In-memory stand-in for the MessageThreadEmailMark table: the two calls the
 *  claim makes, with Postgres' semantics for them. */
function fakeStore() {
  const rows = new Map<string, Date>();
  const key = (threadId: string, companyId: string) => `${threadId}/${companyId}`;
  return {
    rows,
    messageThreadEmailMark: {
      async createMany({
        data,
      }: {
        data: Array<{ threadId: string; companyId: string; lastEmailedAt: Date }>;
      }) {
        let count = 0;
        for (const row of data) {
          const k = key(row.threadId, row.companyId);
          if (rows.has(k)) continue;
          rows.set(k, row.lastEmailedAt);
          count += 1;
        }
        return { count };
      },
      async updateMany({
        where,
        data,
      }: {
        where: { threadId: string; companyId: string; lastEmailedAt: { lte: Date } };
        data: { lastEmailedAt: Date };
      }) {
        const k = key(where.threadId, where.companyId);
        const current = rows.get(k);
        if (!current || current > where.lastEmailedAt.lte) return { count: 0 };
        rows.set(k, data.lastEmailedAt);
        return { count: 1 };
      },
    },
  };
}

// The fake implements exactly the two calls the claim makes.
type Store = Parameters<typeof claimEmailWindows>[0];
const claim = (store: ReturnType<typeof fakeStore>, companies: string[], at: Date) =>
  claimEmailWindows(store as unknown as Store, "thread", companies, at);

const minutes = (base: Date, m: number) => new Date(base.getTime() + m * 60_000);

describe("message email throttle (US-603: 1 email per thread per recipient per 10 min)", () => {
  const t0 = new Date("2026-11-10T10:05:56Z");

  test("the first message to a recipient is emailed", async () => {
    const store = fakeStore();
    expect([...(await claim(store, ["buyer"], t0))]).toEqual(["buyer"]);
  });

  test("five messages inside two minutes produce one email", async () => {
    const store = fakeStore();
    const emailed: number[] = [];
    for (let i = 0; i < 5; i++) {
      const won = await claim(store, ["buyer"], new Date(t0.getTime() + i * 24_000));
      if (won.has("buyer")) emailed.push(i);
    }
    expect(emailed).toEqual([0]);
  });

  test("a company's own message does not use up the window for replies to it", async () => {
    // Production, 2026-11-10: supplier wrote at 10:05:56, the buyer replied at
    // 10:07 and five more times by 10:10. The supplier received nothing.
    const store = fakeStore();
    expect((await claim(store, ["buyer"], t0)).has("buyer")).toBe(true); // supplier → buyer
    const reply = await claim(store, ["supplier"], minutes(t0, 1)); // buyer → supplier
    expect(reply.has("supplier")).toBe(true);
    const burst = await claim(store, ["supplier"], minutes(t0, 3.5));
    expect(burst.has("supplier")).toBe(false); // inside the supplier's own window
  });

  test("the window reopens once it has passed", async () => {
    const store = fakeStore();
    await claim(store, ["buyer"], t0);
    const inside = new Date(t0.getTime() + EMAIL_THROTTLE_MS - 1);
    expect((await claim(store, ["buyer"], inside)).has("buyer")).toBe(false);
    const after = new Date(t0.getTime() + EMAIL_THROTTLE_MS);
    expect((await claim(store, ["buyer"], after)).has("buyer")).toBe(true);
  });

  test("each recipient of a multi-party order thread has its own window", async () => {
    const store = fakeStore();
    await claim(store, ["supplier"], t0); // only the supplier was emailed
    const won = await claim(store, ["supplier", "forwarder"], minutes(t0, 2));
    expect([...won]).toEqual(["forwarder"]);
  });

  test("a recipient listed twice is claimed once", async () => {
    const store = fakeStore();
    expect([...(await claim(store, ["buyer", "buyer"], t0))]).toEqual(["buyer"]);
    expect(store.rows.size).toBe(1);
  });
});
