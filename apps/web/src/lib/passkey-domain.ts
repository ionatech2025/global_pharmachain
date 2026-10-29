/**
 * Why a passkey prompt failed on a domain other than the passkey's own.
 *
 * Passkeys belong to one RP ID (global-pharmachain.vercel.app). On the custom
 * domain they work through Related Origin Requests (/.well-known/webauthn);
 * a browser without that support refuses with a SecurityError, which
 * @simplewebauthn/browser reports as ERROR_INVALID_RP_ID. "Cancelled or not
 * available" would send the admin looking for a broken passkey; say what works.
 */
export function passkeyDomainHelp(err: unknown, rpId: string | undefined): string | null {
  const code = (err as { code?: string } | null)?.code;
  if (code !== "ERROR_INVALID_RP_ID" || !rpId) return null;
  return `This browser can't use your passkey on ${window.location.hostname}. Sign in at https://${rpId} instead, or use an up-to-date Chrome, Edge or Safari.`;
}

/** An error from a passkey ceremony, carrying the RP ID it was asked for. */
export class PasskeyCeremonyError extends Error {
  constructor(
    readonly cause: unknown,
    readonly rpId: string | undefined,
  ) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "PasskeyCeremonyError";
  }
}
