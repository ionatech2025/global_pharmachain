import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";
import { ADMIN_PASSWORD, apiOrigin, DEMO_PASSWORD } from "./helpers";

/**
 * Passkeys as the platform admin's second factor (2026-10-23), driven by Chromium's
 * virtual authenticator so the real WebAuthn ceremonies run — registration, assertion,
 * challenge consumption, credential binding — with no hardware.
 *
 * Local stack only: it needs a hostname WebAuthn accepts (`localhost`, not an IP), and it
 * briefly makes the super admin's sign-in require a passkey, which must never be left
 * behind on a shared deployment. Every case removes what it added.
 *
 * If a run is killed half-way, the super admin may be left requiring a passkey whose
 * private half died with the browser: nobody can then sign in as them. Local recovery:
 *   DELETE FROM "WebAuthnCredential";   -- and, if enrolment answers 429 after many runs,
 *   DELETE FROM "ThrottleBucket";       -- (enrolment is limited to 20 / 15 min per IP)
 * The same SQL, scoped to one user, is the production recovery in
 * docs/runbook-release-and-rollback.md.
 */

const SUPER_ADMIN = "admin@pharmachain.local";
const NILE_ADMIN = "admin@nilepharma.demo";
const IS_LOCAL = /^https?:\/\/localhost(:\d+)?(\/|$)/.test(
  process.env.E2E_BASE_URL ?? "http://localhost:3000",
);

test.describe.configure({ mode: "serial" });
test.skip(!IS_LOCAL, "needs a local stack on http://localhost (WebAuthn rejects IP addresses)");

/** A fresh browser context whose virtual authenticator behaves like a laptop's Touch ID. */
async function contextWithAuthenticator(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return { context, page };
}

async function signInWithPassword(page: Page, email: string, password: string) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function addPasskey(page: Page, name: string) {
  await page.goto("/account", { waitUntil: "networkidle" });
  await page.getByLabel("Name (optional)").fill(name);
  await page.getByRole("button", { name: "Add a passkey" }).click();
  await expect(page.getByText("Passkey added")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("listitem").filter({ hasText: name })).toBeVisible();
}

/** Removes every passkey the account has, through the real UI (it re-asks for the password). */
async function removeAllPasskeys(page: Page, password: string) {
  await page.goto("/account", { waitUntil: "networkidle" });
  for (let guard = 0; guard < 5; guard++) {
    // The list is fetched after hydration: "no Remove button yet" must not be read as "none".
    await expect(page.getByText("Loading…")).toHaveCount(0, { timeout: 15_000 });
    const remove = page.getByRole("button", { name: "Remove", exact: true }).first();
    if ((await remove.count()) === 0) return;
    await remove.click();
    await page.getByLabel("Confirm with your password").fill(password);
    await page.getByRole("button", { name: "Remove passkey" }).click();
    await expect(page.getByText("Passkey removed")).toBeVisible({ timeout: 15_000 });
  }
}

async function closeAll(...contexts: BrowserContext[]) {
  await Promise.all(contexts.map((c) => c.close().catch(() => undefined)));
}

test("a platform admin is nudged to enrol, can add a passkey, and from then on must present it", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const { context, page } = await contextWithAuthenticator(browser);
  try {
    await signInWithPassword(page, SUPER_ADMIN, ADMIN_PASSWORD);
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

    // Nothing is forced yet — but the admin is asked.
    await expect(page.getByText("Protect the platform with a passkey")).toBeVisible();

    await addPasskey(page, "QA virtual key");
    // Enrolled: the nudge goes away.
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await expect(page.getByText("Protect the platform with a passkey")).toHaveCount(0);

    // Signed out, the password alone no longer opens the account: the passkey is asked for
    // (the virtual authenticator answers) and the admin lands in the app.
    await context.clearCookies();
    await signInWithPassword(page, SUPER_ADMIN, ADMIN_PASSWORD);
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  } finally {
    await removeAllPasskeys(page, ADMIN_PASSWORD).catch(() => undefined);
    await closeAll(context);
  }
});

test("the right password without the passkey does not get in", async ({ browser }) => {
  test.setTimeout(180_000);
  const owner = await contextWithAuthenticator(browser);
  try {
    await signInWithPassword(owner.page, SUPER_ADMIN, ADMIN_PASSWORD);
    await expect(owner.page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
    await addPasskey(owner.page, "QA key (kept on the first device)");

    // A second device that has never seen this account: its authenticator holds nothing.
    const thief = await contextWithAuthenticator(browser);
    try {
      await signInWithPassword(thief.page, SUPER_ADMIN, ADMIN_PASSWORD);
      await expect(
        thief.page.getByText(/cancelled or is not available on this device/i),
      ).toBeVisible({ timeout: 30_000 });
      await expect(thief.page).toHaveURL(/\/login/);
      // The fallback is offered, but a TOTP code cannot stand in for an admin's passkey.
      await expect(thief.page.getByText(/authenticator app code instead/i)).toBeVisible();
    } finally {
      await closeAll(thief.context);
    }
  } finally {
    await removeAllPasskeys(owner.page, ADMIN_PASSWORD).catch(() => undefined);
    await closeAll(owner.context);
  }
});

test("someone else's valid passkey is not a second factor for this account", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  // A different user enrols a perfectly valid passkey on this device …
  const device = await contextWithAuthenticator(browser);
  const owner = await contextWithAuthenticator(browser);
  try {
    await signInWithPassword(device.page, NILE_ADMIN, DEMO_PASSWORD);
    await expect(device.page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
    await addPasskey(device.page, "QA other-user key");

    await signInWithPassword(owner.page, SUPER_ADMIN, ADMIN_PASSWORD);
    await expect(owner.page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
    await addPasskey(owner.page, "QA admin key");

    // … and the super admin, password right, tries to finish signing in with THAT passkey.
    // Re-point: a context whose authenticator holds only the other user's credential.
    await device.context.clearCookies();
    await signInWithPassword(device.page, SUPER_ADMIN, ADMIN_PASSWORD);
    await expect(device.page.getByText(/passkey could not be verified/i)).toBeVisible({
      timeout: 30_000,
    });
    await expect(device.page).toHaveURL(/\/login/);
  } finally {
    // Nile's passkey would otherwise make every later sign-in by that demo user need one.
    await device.context.clearCookies();
    await removeAllPasskeysFor(browser, NILE_ADMIN, DEMO_PASSWORD, device);
    await removeAllPasskeys(owner.page, ADMIN_PASSWORD).catch(() => undefined);
    await closeAll(device.context, owner.context);
  }
});

/** The device that holds the user's own passkey is the one that can sign them back in to clean up. */
async function removeAllPasskeysFor(
  _browser: Browser,
  email: string,
  password: string,
  device: { page: Page },
) {
  await signInWithPassword(device.page, email, password);
  await device.page.waitForURL(/\/dashboard/, { timeout: 30_000 }).catch(() => undefined);
  await removeAllPasskeys(device.page, password).catch(() => undefined);
}

test("a challenge is single-use: it cannot be spent twice, even with a fresh signature", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const { context, page } = await contextWithAuthenticator(browser);
  try {
    await signInWithPassword(page, SUPER_ADMIN, ADMIN_PASSWORD);
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
    await addPasskey(page, "QA replay key");

    const api = apiOrigin(process.env.E2E_BASE_URL);
    const options = await (await page.request.post(`${api}/auth/passkey/options`)).json();
    // The authenticator signs the SAME challenge twice. The second signature carries a
    // higher counter, so it is not a literal replay: only the spent challenge can refuse it
    // (authenticators that keep their counter at 0 — synced passkeys — have nothing else).
    const [first, second] = await page.evaluate(async (opts) => {
      const fromB64u = (s: string) => {
        const pad = "=".repeat((4 - (s.length % 4)) % 4);
        return Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad), (c) =>
          c.charCodeAt(0),
        );
      };
      const toB64u = (b: ArrayBuffer) =>
        btoa(String.fromCharCode(...new Uint8Array(b)))
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");
      const sign = async () => {
        const cred = (await navigator.credentials.get({
          publicKey: {
            challenge: fromB64u(opts.challenge),
            rpId: opts.rpId,
            userVerification: "required",
          },
        })) as PublicKeyCredential;
        const r = cred.response as AuthenticatorAssertionResponse;
        return JSON.stringify({
          id: cred.id,
          rawId: toB64u(cred.rawId),
          type: cred.type,
          response: {
            clientDataJSON: toB64u(r.clientDataJSON),
            authenticatorData: toB64u(r.authenticatorData),
            signature: toB64u(r.signature),
            userHandle: r.userHandle ? toB64u(r.userHandle) : undefined,
          },
          clientExtensionResults: cred.getClientExtensionResults(),
        });
      };
      return [await sign(), await sign()];
    }, options);

    const login = (passkey: string) =>
      page.request.post(`${api}/auth/login`, {
        data: { email: SUPER_ADMIN, password: ADMIN_PASSWORD, passkey },
      });
    const accepted = await login(first as string);
    expect(accepted.status(), await accepted.text()).toBe(200);

    // A different, validly signed assertion for the same challenge: refused.
    const fresh = await login(second as string);
    expect(fresh.status()).toBe(401);
    expect(await fresh.text()).toMatch(/PASSKEY_INVALID/);
    // And the first one, replayed byte for byte, is refused too.
    const replay = await login(first as string);
    expect(replay.status()).toBe(401);
  } finally {
    await removeAllPasskeys(page, ADMIN_PASSWORD).catch(() => undefined);
    await closeAll(context);
  }
});

test("removing a passkey asks for the password again", async ({ browser }) => {
  test.setTimeout(180_000);
  const { context, page } = await contextWithAuthenticator(browser);
  try {
    await signInWithPassword(page, SUPER_ADMIN, ADMIN_PASSWORD);
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
    await addPasskey(page, "QA removable key");

    // A wrong password leaves it in place.
    await page.getByRole("button", { name: "Remove", exact: true }).first().click();
    await page.getByLabel("Confirm with your password").fill("not the right password at all");
    await page.getByRole("button", { name: "Remove passkey" }).click();
    await expect(page.getByText(/current password is incorrect/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("listitem").filter({ hasText: "QA removable key" })).toBeVisible();
  } finally {
    await removeAllPasskeys(page, ADMIN_PASSWORD).catch(() => undefined);
    await closeAll(context);
  }
});
