import { Prisma } from "@pharmachain/db";

const ATTEMPTS = 3;

/**
 * Runs a Serializable transaction, retrying the serialization failures
 * Postgres raises under concurrency (Prisma P2034). Those are safe to retry by
 * definition — the transaction was rolled back whole — and they are not
 * limited to genuine conflicts: predicate locks can collide between unrelated
 * companies doing the same thing at once. Without a retry each one reached the
 * user as a 409 "please retry". Any other error propagates untouched.
 */
export async function withSerializableRetry<T>(run: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await run();
    } catch (err) {
      const retryable = err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2034";
      if (!retryable || attempt >= ATTEMPTS) throw err;
      // Jittered backoff so the colliding transactions do not collide again.
      await new Promise((resolve) => setTimeout(resolve, 20 * attempt + Math.random() * 30));
    }
  }
}
