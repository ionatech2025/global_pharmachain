/**
 * Where to go after signing in, when a page sent the visitor to /login.
 * Same-site paths only — never a protocol-relative `//host`, a backslash
 * variant browsers normalise into one, or the login page itself — so the
 * parameter cannot be used to bounce someone to another site.
 */
export function safeCallbackUrl(value: string | null | undefined): string | null {
  if (!value?.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  if (value === "/login" || value.startsWith("/login?") || value.startsWith("/api/")) return null;
  return value;
}

/** /login, carrying the page to come back to when there is one worth keeping. */
export function loginUrlFor(path: string | null | undefined): string {
  const safe = safeCallbackUrl(path);
  return safe && safe !== "/dashboard"
    ? `/login?callbackUrl=${encodeURIComponent(safe)}`
    : "/login";
}
