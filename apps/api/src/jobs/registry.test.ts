import { beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let jobNames: (tier?: "frequent" | "daily") => string[];

beforeAll(async () => {
  // The registry imports the API's env module, which validates on load; as in
  // upload-content.test.ts, placeholders keep it quiet — nothing connects.
  process.env.DATABASE_URL ??= "postgresql://localhost:5432/pharmachain";
  process.env.AUTH_SECRET ??= "test-secret-at-least-16-chars";
  ({ jobNames } = await import("./registry"));
});

describe("job registry ↔ scheduler", () => {
  test("the daily workflow runs exactly the registry's daily jobs", () => {
    // jobs-daily.yml calls each daily job by name, one request apiece; a job
    // added to the registry but not to that list would simply never run.
    const workflow = readFileSync(
      join(import.meta.dir, "../../../../.github/workflows/jobs-daily.yml"),
      "utf8",
    );
    const listed =
      workflow
        .match(/JOBS="([^"]+)"/)?.[1]
        ?.split(/\s+/)
        .filter(Boolean) ?? [];
    expect([...listed].sort()).toEqual([...jobNames("daily")].sort());
  });
});
