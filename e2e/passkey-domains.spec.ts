import { expect, test } from "@playwright/test";
import { ADMIN_PASSWORD, signInFresh } from "./helpers";

/**
 * Passkeys on every domain the app is served from (2026-10-29).
 *
 * Passkeys are bound to one RP ID, global-pharmachain.vercel.app. On the client's
 * domain, www.pharmachainglobal.com, browsers refused them with a SecurityError,
 * so a platform admin there could not finish signing in. WebAuthn's Related
 * Origin Requests fix it without re-enrolling anyone: the RP ID's host publishes
 * /.well-known/webauthn listing the other origins. Run this file against each
 * domain (E2E_BASE_URL) — the sign-in case is the one that matters on the
 * custom domain.
 */
const SUPER_ADMIN = "admin@pharmachain.local";
const BASE = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const RP_ID = process.env.E2E_ADMIN_PASSKEY_RP_ID ?? new URL(BASE).hostname;
const IS_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(BASE);

test("the passkey host publishes every origin that may use its passkeys", async ({ request }) => {
  test.skip(IS_LOCAL, "WEBAUTHN_ORIGINS is a deployment setting");
  const res = await request.get(`https://${RP_ID}/.well-known/webauthn`);
  expect(res.status()).toBe(200);
  // The spec requires JSON with this content type; anything else is ignored.
  expect(res.headers()["content-type"]).toContain("application/json");
  const { origins } = (await res.json()) as { origins: string[] };
  expect(origins).toContain(new URL(BASE).origin);
  for (const origin of origins) expect(origin).toMatch(/^https:\/\/[^/]+$/);
});

test("a platform admin completes a passkey sign-in on this domain", async ({ browser }) => {
  test.skip(
    !process.env.E2E_ADMIN_PASSKEY_ID,
    "needs the dedicated test passkey (E2E_ADMIN_PASSKEY_*)",
  );
  test.setTimeout(120_000);
  // signInFresh attaches the test passkey to Chromium's virtual authenticator; the
  // password alone is not enough for this account, so reaching the dashboard means
  // the passkey step succeeded on this origin.
  const page = await signInFresh(browser, SUPER_ADMIN, ADMIN_PASSWORD);
  await expect(page).toHaveURL(
    new RegExp(`^${new URL(BASE).origin.replace(/\./g, "\\.")}/dashboard`),
  );
  await page.context().close();
});
