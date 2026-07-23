import { type NextRequest, NextResponse } from "next/server";

/**
 * Per-request nonce CSP (deferred item). Scope: every dynamically-rendered
 * route — the authenticated app and the auth forms. The static marketing
 * page and static assets are excluded: their HTML is baked at build time, so
 * a per-request nonce cannot match and would break Next's inline bootstrap.
 *
 * Next.js reads the nonce from the request's Content-Security-Policy header
 * and stamps it onto the inline scripts it renders; 'strict-dynamic' lets
 * those scripts load the chunk graph without enumerating every file.
 */
export function middleware(request: NextRequest) {
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
    // Everything except: the static landing (exact /), Next internals/static
    // assets, PWA + SEO files, icons and social images.
    "/((?!_next/|api/|icons/|favicon\\.ico|sw\\.js|offline\\.html|manifest\\.webmanifest|robots\\.txt|apple-icon|opengraph-image|twitter-image|$).*)",
  ],
};
