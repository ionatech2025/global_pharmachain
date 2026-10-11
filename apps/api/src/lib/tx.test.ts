import { describe, expect, test } from "bun:test";
import { Prisma } from "@pharmachain/db";
import { withSerializableRetry } from "./tx";

const conflict = () =>
  new Prisma.PrismaClientKnownRequestError("serialization failure", {
    code: "P2034",
    clientVersion: "test",
  });

describe("withSerializableRetry", () => {
  test("a serialization failure is retried until it succeeds", async () => {
    let calls = 0;
    const result = await withSerializableRetry(async () => {
      calls += 1;
      if (calls < 3) throw conflict();
      return "committed";
    });
    expect(result).toBe("committed");
    expect(calls).toBe(3);
  });

  test("it gives up after three attempts and surfaces the failure", async () => {
    let calls = 0;
    await expect(
      withSerializableRetry(async () => {
        calls += 1;
        throw conflict();
      }),
    ).rejects.toThrow("serialization failure");
    expect(calls).toBe(3);
  });

  test("any other error is not retried", async () => {
    let calls = 0;
    await expect(
      withSerializableRetry(async () => {
        calls += 1;
        throw new Error("limit reached");
      }),
    ).rejects.toThrow("limit reached");
    expect(calls).toBe(1);
  });
});
