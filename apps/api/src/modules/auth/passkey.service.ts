import { Injectable } from "@nestjs/common";
import { prisma } from "@pharmachain/db";
import { genericEventEmail } from "@pharmachain/email";
import {
  type AuthenticationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import { recordAudit } from "../../common/audit";
import { badRequest, conflict, forbidden, notFound } from "../../common/errors";
import { defer } from "../../lib/defer";
import { logger } from "../../lib/logger";
import { verifyPassword } from "../../lib/password";
import { consumeChallenge, saveChallenge, webAuthnConfig } from "../../lib/webauthn";
import { sendEmailTo } from "../shared/mailer";

const MAX_PASSKEYS_PER_USER = 10;

interface Actor {
  id: string;
  email: string;
  name: string;
}

/**
 * Passkeys / security keys as a second factor (WebAuthn level 2, via SimpleWebAuthn).
 *
 * Credentials are discoverable and require user verification (a PIN or biometric on the
 * device), so a stolen laptop or key alone is not enough, and the sign-in challenge can be
 * issued WITHOUT naming an account — which means asking for one leaks nothing about who
 * has a passkey. Who may sign in is decided afterwards, against the user the password (or
 * emailed code) already identified.
 */
@Injectable()
export class PasskeyService {
  count(userId: string): Promise<number> {
    return prisma.webAuthnCredential.count({ where: { userId } });
  }

  list(userId: string) {
    return prisma.webAuthnCredential.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        deviceType: true,
        backedUp: true,
        transports: true,
        createdAt: true,
        lastUsedAt: true,
      },
    });
  }

  // ── Enrolment (signed in) ──────────────────────────────────────────────────

  async registrationOptions(user: Actor) {
    const existing = await prisma.webAuthnCredential.findMany({
      where: { userId: user.id },
      select: { credentialId: true, transports: true },
    });
    if (existing.length >= MAX_PASSKEYS_PER_USER) {
      throw conflict(
        `You can register at most ${MAX_PASSKEYS_PER_USER} passkeys — remove one first`,
      );
    }
    const { rpName, rpID } = webAuthnConfig();
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: user.email,
      userDisplayName: user.name,
      // A stable handle that is not personal data: the account id.
      userID: new TextEncoder().encode(user.id),
      attestationType: "none",
      excludeCredentials: existing.map((c) => ({ id: c.credentialId, transports: c.transports })),
      authenticatorSelection: { residentKey: "required", userVerification: "required" },
    });
    await saveChallenge("register", options.challenge, user.id);
    return options;
  }

  async verifyRegistration(user: Actor, response: RegistrationResponseJSON, name: string) {
    const { rpID, origins } = webAuthnConfig();
    let verified: Awaited<ReturnType<typeof verifyRegistrationResponse>>;
    try {
      verified = await verifyRegistrationResponse({
        response,
        expectedChallenge: (challenge) => consumeChallenge("register", challenge, user.id),
        expectedOrigin: origins,
        expectedRPID: rpID,
        requireUserVerification: true,
      });
    } catch (err) {
      logger.warn("passkey registration rejected", { userId: user.id, error: String(err) });
      throw badRequest("That passkey could not be verified. Please try adding it again.");
    }
    if (!verified.verified) {
      throw badRequest("That passkey could not be verified. Please try adding it again.");
    }
    const { credential, credentialDeviceType, credentialBackedUp } = verified.registrationInfo;
    const duplicate = await prisma.webAuthnCredential.findUnique({
      where: { credentialId: credential.id },
      select: { id: true },
    });
    if (duplicate) throw conflict("That passkey is already registered");
    const created = await prisma.webAuthnCredential.create({
      data: {
        userId: user.id,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: BigInt(credential.counter),
        transports: credential.transports ?? [],
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        name: name.trim() || "Passkey",
      },
      select: { id: true, name: true, createdAt: true },
    });
    await recordAudit(user, {
      action: "user.passkey-add",
      entityType: "User",
      entityId: user.id,
      newValues: { passkeyId: created.id, name: created.name },
    });
    this.notifyOwner(
      user,
      "A passkey was added to your account",
      `"${created.name}" can now be used to sign in to Global PharmaChain. If this was not you, change your password and remove it under Account → Passkeys.`,
    );
    return created;
  }

  /** Removing a sign-in factor is a sensitive act, so it asks for the password again. */
  async remove(user: Actor, id: string, currentPassword: string) {
    const row = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { passwordHash: true },
    });
    if (!row.passwordHash || !(await verifyPassword(currentPassword, row.passwordHash))) {
      throw forbidden("Current password is incorrect");
    }
    const credential = await prisma.webAuthnCredential.findFirst({
      where: { id, userId: user.id },
      select: { id: true, name: true },
    });
    if (!credential) throw notFound("Passkey not found");
    await prisma.webAuthnCredential.delete({ where: { id: credential.id } });
    await recordAudit(user, {
      action: "user.passkey-remove",
      entityType: "User",
      entityId: user.id,
      oldValues: { passkeyId: credential.id, name: credential.name },
    });
    this.notifyOwner(
      user,
      "A passkey was removed from your account",
      `"${credential.name}" can no longer be used to sign in. If this was not you, change your password now.`,
    );
  }

  // ── Sign-in ────────────────────────────────────────────────────────────────

  /** Public: no account is named, so there is nothing about any account to learn from it. */
  async authenticationOptions() {
    const { rpID } = webAuthnConfig();
    const options = await generateAuthenticationOptions({ rpID, userVerification: "required" });
    await saveChallenge("login", options.challenge);
    return options;
  }

  /**
   * True only for a fresh, correctly signed assertion made by one of THIS user's own
   * credentials. The user comes from the password step, never from the assertion, so a
   * valid passkey belonging to someone else is not a second factor for this account.
   */
  async verifyAssertion(userId: string, assertion: AuthenticationResponseJSON): Promise<boolean> {
    const credential = await prisma.webAuthnCredential.findUnique({
      where: { credentialId: assertion.id },
    });
    if (!credential || credential.userId !== userId) return false;
    const { rpID, origins } = webAuthnConfig();
    try {
      const result = await verifyAuthenticationResponse({
        response: assertion,
        expectedChallenge: (challenge) => consumeChallenge("login", challenge),
        expectedOrigin: origins,
        expectedRPID: rpID,
        requireUserVerification: true,
        credential: {
          id: credential.credentialId,
          publicKey: new Uint8Array(credential.publicKey),
          counter: Number(credential.counter),
          transports: credential.transports,
        },
      });
      if (!result.verified) return false;
      await prisma.webAuthnCredential.update({
        where: { id: credential.id },
        data: { counter: BigInt(result.authenticationInfo.newCounter), lastUsedAt: new Date() },
      });
      return true;
    } catch (err) {
      // Includes a counter that went backwards (a cloned authenticator) — refused, logged.
      logger.warn("passkey assertion rejected", { userId, error: String(err) });
      return false;
    }
  }

  private notifyOwner(user: Actor, title: string, body: string) {
    defer(sendEmailTo(user.email, genericEventEmail({ title, body })));
  }
}
