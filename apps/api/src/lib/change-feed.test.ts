import { describe, expect, test } from "bun:test";
import { changeFeed } from "./change-feed";

/** Collect what a feed emits while the fingerprint walks through `values`. */
async function run(values: string[], lastEventId?: string): Promise<string[]> {
  let i = 0;
  const fingerprint = async () => values[Math.min(i++, values.length - 1)] as string;
  const seen: string[] = [];
  await new Promise<void>((resolve) => {
    changeFeed(fingerprint, lastEventId, {
      intervalMs: 5,
      lifetimeMs: 5 * values.length + 30,
    }).subscribe({
      next: (e) =>
        seen.push((e.data as { baseline?: boolean }).baseline ? `baseline:${e.id}` : String(e.id)),
      complete: resolve,
    });
  });
  return seen;
}

describe("RFQ change feed", () => {
  test("a fresh connection announces its baseline, then reports nothing until something changes", async () => {
    // The browser keeps the baseline's id, so the next reconnect can resume from it.
    expect(await run(["a", "a", "a"])).toEqual(["baseline:a"]);
  });

  test("each change is reported once, with the new fingerprint as its id", async () => {
    expect(await run(["a", "b", "b", "c"])).toEqual(["baseline:a", "b", "c"]);
  });

  test("a reconnect that missed a change is told at once", async () => {
    // EventSource resends the last id it saw; the world has moved on since.
    expect(await run(["b", "b"], "a")).toEqual(["b"]);
  });

  test("a reconnect that missed nothing stays quiet", async () => {
    expect(await run(["a", "a"], "a")).toEqual([]);
  });

  test("a failed read skips the tick instead of ending the stream", async () => {
    let n = 0;
    const seen: string[] = [];
    await new Promise<void>((resolve) => {
      changeFeed(
        async () => {
          n++;
          if (n === 2) throw new Error("db blip");
          return n < 3 ? "a" : "b";
        },
        undefined,
        { intervalMs: 5, lifetimeMs: 60 },
      ).subscribe({ next: (e) => seen.push(String(e.id)), complete: resolve });
    });
    expect(seen).toEqual(["a", "b"]);
  });
});
