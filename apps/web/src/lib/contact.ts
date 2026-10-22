/**
 * Public contact details shown in the footer, the legal pages and security.txt.
 *
 * Set NEXT_PUBLIC_CONTACT_EMAIL / NEXT_PUBLIC_CONTACT_PHONE(S) in the Vercel
 * project to change them without a code edit (NEXT_PUBLIC_ values are inlined
 * at build time, so a release is needed for a change to show). The defaults are
 * the addresses the site has always published — confirm the mailbox actually
 * receives mail (the domain needs MX records) before relying on them.
 */
export const CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "contact@globalpharmachain.com";

/** Display form, e.g. "+256 700 000 000 / +254 700 000 000"; the first number is the dial link. */
export const CONTACT_PHONES: string[] = (
  process.env.NEXT_PUBLIC_CONTACT_PHONES ?? "+256 700 000 000,+254 700 000 000"
)
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);

/** `tel:` href for a display number — digits and a leading plus only. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}
