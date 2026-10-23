import { prisma } from "@pharmachain/db";
import { env } from "../env";

/**
 * Relying-party settings. The RP ID is what a passkey is bound to, so it comes from
 * configuration, not from the request (a request can say anything).
 */
export function webAuthnConfig(): { rpName: string; rpID: string; origins: string[] } {
  const app = new URL(env.APP_URL);
  const origins = env.WEBAUTHN_ORIGINS
    ? env.WEBAUTHN_ORIGINS.split(",")
        .map((o) => o.trim())
        .filter(Boolean)
    : [app.origin];
  return { rpName: "Global PharmaChain", rpID: env.WEBAUTHN_RP_ID ?? app.hostname, origins };
}

/**
 * Challenges live in the durable ThrottleBucket table (a serverless request can land on
 * any instance, so memory will not do): written when options are issued, deleted when
 * used — single use — and ignored once they expire. The housekeeping job already prunes
 * expired rows. The challenge is part of the key, so presenting one is its own lookup.
 */
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export type ChallengeKind = "register" | "login";

function challengeKey(kind: ChallengeKind, challenge: string, userId?: string): string {
  return `webauthn:${kind}:${userId ?? "-"}:${challenge}`;
}

export async function saveChallenge(
  kind: ChallengeKind,
  challenge: string,
  userId?: string,
): Promise<void> {
  await prisma.$executeRaw`
    INSERT INTO "ThrottleBucket" ("key", "count", "expiresAt")
    VALUES (${challengeKey(kind, challenge, userId)}, 1, ${new Date(Date.now() + CHALLENGE_TTL_MS)})
    ON CONFLICT ("key") DO NOTHING
  `;
}

/** True exactly once per issued, unexpired challenge. */
export async function consumeChallenge(
  kind: ChallengeKind,
  challenge: string,
  userId?: string,
): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ key: string }>>`
    DELETE FROM "ThrottleBucket"
    WHERE "key" = ${challengeKey(kind, challenge, userId)} AND "expiresAt" > now()
    RETURNING "key"
  `;
  return rows.length > 0;
}
