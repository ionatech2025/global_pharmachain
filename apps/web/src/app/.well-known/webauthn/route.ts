import { NextResponse } from "next/server";

/**
 * WebAuthn Related Origin Requests (WebAuthn Level 3): the list of other origins
 * allowed to use passkeys whose RP ID is this host.
 *
 * Passkeys are bound to `global-pharmachain.vercel.app` (the RP ID, pinned by
 * WEBAUTHN_RP_ID). The client's own domain, www.pharmachainglobal.com, is a
 * different site, so a browser on it refused every passkey with a SecurityError —
 * a platform admin there could not finish signing in. Moving the RP ID to the
 * custom domain would orphan every passkey already registered; this file lets
 * the browser accept the custom domain instead, with no passkey re-enrolled.
 *
 * The browser fetches it from the RP ID's origin and checks the calling origin
 * against `origins` (application/json, one object; Chrome honours up to five
 * distinct eTLD+1 labels). The same allow-list is what the API accepts as the
 * expected origin when it verifies, so the two cannot drift.
 */
export const dynamic = "force-dynamic";

export function GET() {
  const origins = (process.env.WEBAUTHN_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter((o) => {
      try {
        const url = new URL(o);
        return url.protocol === "https:" && url.origin === o;
      } catch {
        return false;
      }
    });
  if (origins.length === 0) return new NextResponse(null, { status: 404 });
  return NextResponse.json(
    { origins },
    { headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } },
  );
}
