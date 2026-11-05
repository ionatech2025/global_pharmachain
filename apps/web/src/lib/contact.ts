/**
 * Public contact details shown in the footer, the legal pages, support dialogs
 * and security.txt.
 *
 * Set NEXT_PUBLIC_SALES_EMAIL / NEXT_PUBLIC_INFO_EMAIL /
 * NEXT_PUBLIC_SUPPORT_EMAIL (or NEXT_PUBLIC_CONTACT_EMAIL) and
 * NEXT_PUBLIC_CONTACT_PHONES in the Vercel project to change them without a
 * code edit (NEXT_PUBLIC_ values are inlined at build time, so a release is
 * needed for a change to show). The defaults are the verified mailboxes on
 * pharmachainglobal.com (MX: mx1.spacemail.com, mx2.spacemail.com).
 */
export const SALES_EMAIL = process.env.NEXT_PUBLIC_SALES_EMAIL ?? "sales@pharmachainglobal.com";

export const INFO_EMAIL =
  process.env.NEXT_PUBLIC_INFO_EMAIL ??
  process.env.NEXT_PUBLIC_CONTACT_EMAIL ??
  "info@pharmachainglobal.com";

export const SUPPORT_EMAIL =
  process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? "support@pharmachainglobal.com";

/** Primary general & compliance contact address. */
export const CONTACT_EMAIL = INFO_EMAIL;

/** Official platform mailboxes in display order. */
export const CONTACT_EMAILS = [
  { role: "sales", label: "Sales", email: SALES_EMAIL },
  { role: "info", label: "General & compliance", email: INFO_EMAIL },
  { role: "support", label: "Support", email: SUPPORT_EMAIL },
] as const;

/** Display form, e.g. "+256 751 557058"; the first number is the dial link. */
export const CONTACT_PHONES: string[] = (
  process.env.NEXT_PUBLIC_CONTACT_PHONES ?? "+256 751 557058"
)
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);

/** `tel:` href for a display number — digits and a leading plus only. */
export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}
