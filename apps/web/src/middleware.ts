import { type NextRequest, NextResponse } from "next/server";

const SESSION_COOKIES = ["__Secure-authjs.session-token", "authjs.session-token"];

/** A session cookie is present (Auth.js may split a large one into `.0`, `.1`…). */
function hasSessionCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some(({ name }) => SESSION_COOKIES.some((c) => name === c || name.startsWith(`${c}.`)));
}

/**
 * Two jobs, by path.
 *
 * `/` — the marketing page is static and served from the edge cache, so the
 * one per-visitor decision left (send a signed-in visitor on to their
 * dashboard) is made here instead of by rendering the page per request. A
 * session cookie's presence is enough: the cookie expires with the session,
 * and the dashboard verifies it properly (a revoked one bounces to /login).
 *
 * Everything else matched — per-request nonce CSP (deferred item). Scope:
 * every dynamically-rendered route — the authenticated app and the auth
 * forms. Static HTML is excluded: it is baked at build time, so a
 * per-request nonce cannot match and would break Next's inline bootstrap.
 *
 * Next.js reads the nonce from the request's Content-Security-Policy header
 * and stamps it onto the inline scripts it renders; 'strict-dynamic' lets
 * those scripts load the chunk graph without enumerating every file.
 */
export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/") {
    return hasSessionCookie(request)
      ? NextResponse.redirect(new URL("/dashboard", request.url))
      : NextResponse.next();
  }

  const nonce = btoa(crypto.randomUUID());
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "style-src 'self' 'unsafe-inline'",
    // Signed document/logo URLs live on the object-storage host → https:
    "img-src 'self' blob: data: https:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'self'",
    "form-action 'self'",
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("content-security-policy", csp);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    // The landing page, for the signed-in redirect only (no CSP — it is static).
    "/",
    // Everything else except: Next internals/static assets, PWA + SEO files,
    // icons and social images.
    "/((?!_next/|api/|icons/|favicon\\.ico|sw\\.js|offline\\.html|manifest\\.webmanifest|robots\\.txt|sitemap\\.xml|\\.well-known/|apple-icon|opengraph-image|twitter-image|$).*)",
  ],
};
