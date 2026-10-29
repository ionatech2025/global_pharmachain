import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  type APIResponse,
  type Browser,
  type BrowserContext,
  expect,
  type Page,
} from "@playwright/test";

/**
 * Shared e2e plumbing.
 *
 * The API is reachable by two different routes depending on how the stack is
 * running, and the specs need both:
 *
 *  - **API_PATH** — a same-origin path used from a signed-in browser context,
 *    so the Auth.js session cookie rides along. Deployed, the API is mounted
 *    inside this deployment at `/api/backend`. Running locally it is a separate
 *    server, reached through the web app's `/api/proxy` (which converts the
 *    cookie into the Bearer token the API expects).
 *
 *  - **apiOrigin()** — an absolute base for the few assertions that must reach
 *    the API *without* the web proxy in the way: helmet's security headers, the
 *    trusted-proxy IP rules and the raw JSON error envelope. The proxy forwards
 *    only `content-type`, so those headers never survive it.
 *
 * Defaults target a deployed stack, so nothing changes for existing CI usage.
 * For a local stack set:
 *   E2E_API_PATH=/api/proxy  E2E_API_ORIGIN=http://127.0.0.1:3001
 */
export const API_PATH = process.env.E2E_API_PATH ?? "/api/backend";

export function apiOrigin(baseURL: string | undefined): string {
  return process.env.E2E_API_ORIGIN ?? `${baseURL ?? ""}${API_PATH}`;
}

const TARGET = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const LOCAL_TARGET = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/.test(TARGET);

/**
 * The seed's fallback passwords are published in this public repository, so
 * they only stand in for a local stack. Against any deployed target the real
 * passwords must come from the environment — a run that silently fell back to
 * the public defaults is exactly how a live deployment ends up depending on
 * them.
 */
function seedPassword(envName: string, localDefault: string): string {
  const value = process.env[envName];
  if (value) return value;
  if (LOCAL_TARGET) return localDefault;
  throw new Error(`${envName} must be set to run the e2e suite against ${TARGET}`);
}

export const DEMO_PASSWORD = seedPassword("SEED_DEMO_PASSWORD", "demo-Pass-1");
export const ADMIN_PASSWORD = seedPassword("SEED_SUPER_ADMIN_PASSWORD", "admin-ChangeMe-1");

export const ERROR_BOUNDARY = /Something went wrong loading this page/i;

/**
 * Signs in through the real login form once per role, then hands out fresh
 * contexts seeded with that session.
 *
 * The API throttles logins at 40 per 15 minutes per client IP — a real control
 * (regression.spec.ts asserts it). A suite that signed in for every describe
 * block tripped its own limiter and failed with unexplained login timeouts, so
 * the session is captured once and reused. Each caller still gets an isolated
 * context; only the credential round-trip is shared.
 */
type StorageState = Awaited<ReturnType<BrowserContext["storageState"]>>;

// Cached on disk, not just in memory: Playwright restarts its worker process
// after a failure, which would drop an in-memory cache and start signing in
// again. Reused for less than the 30-minute session lifetime.
const SESSION_DIR = path.join(process.cwd(), "test-results", ".auth");
const SESSION_TTL_MS = 20 * 60 * 1000;

/** Keyed by target as well as email: a session captured against a local stack
 *  carries cookies scoped to that host and is useless against a deployed one.
 *  Without the target in the key, switching E2E_BASE_URL silently reuses the
 *  wrong cookies and every sign-in looks like it failed. */
function sessionFile(email: string): string {
  const target = (process.env.E2E_BASE_URL ?? "default").replace(/[^a-z0-9]/gi, "_");
  return path.join(SESSION_DIR, `${target}__${email.replace(/[^a-z0-9]/gi, "_")}.json`);
}

function readCachedSession(email: string): StorageState | null {
  try {
    const file = sessionFile(email);
    if (Date.now() - fs.statSync(file).mtimeMs > SESSION_TTL_MS) return null;
    return JSON.parse(fs.readFileSync(file, "utf8")) as StorageState;
  } catch {
    return null;
  }
}

/**
 * DNS and connect-stage failures against a deployed target: nothing reached
 * the server, so re-navigating is safe and changes no state.
 */
const NEVER_REACHED =
  /ERR_NAME_NOT_RESOLVED|EAI_AGAIN|ENOTFOUND|getaddrinfo|ERR_CONNECTION|ETIMEDOUT/i;

/**
 * A sign-in that survives the link, not just the server. Runs against a
 * deployed stack have died mid-suite on a single dropped name lookup, which
 * reports as a product failure and skips every case downstream of it.
 */
export async function gotoResilient(page: Page, path: string, attempts = 4): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await page.goto(path);
      return;
    } catch (err) {
      if (!NEVER_REACHED.test(String((err as Error)?.message ?? err))) throw err;
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, 1_000 * (attempt + 1)));
    }
  }
  throw lastError;
}

/**
 * A platform admin with a passkey must present it after the password, so a
 * deployed run needs one too. It is a dedicated test credential (not the
 * admin's own), held as a key pair outside the repo:
 *   E2E_ADMIN_PASSKEY_ID           credential id, base64url (as the server stores it)
 *   E2E_ADMIN_PASSKEY_PRIVATE_KEY  P-256 private key, PKCS#8 DER, base64
 *   E2E_ADMIN_PASSKEY_RP_ID        the deployment's relying-party id
 *   E2E_ADMIN_PASSKEY_EMAIL        whose it is (default: the seeded super admin)
 * Chromium's virtual authenticator then answers the prompt like Touch ID would.
 * The server refuses a signature counter that does not move forward (a cloned
 * authenticator), and every context gets a fresh authenticator, so the counter
 * starts from the clock: always ahead of whatever the last run left stored.
 */
const ADMIN_PASSKEY =
  process.env.E2E_ADMIN_PASSKEY_ID && process.env.E2E_ADMIN_PASSKEY_PRIVATE_KEY
    ? {
        id: process.env.E2E_ADMIN_PASSKEY_ID,
        privateKey: process.env.E2E_ADMIN_PASSKEY_PRIVATE_KEY,
        rpId: process.env.E2E_ADMIN_PASSKEY_RP_ID ?? new URL(TARGET).hostname,
        email: (process.env.E2E_ADMIN_PASSKEY_EMAIL ?? "admin@pharmachain.local").toLowerCase(),
      }
    : null;
let passkeyUses = 0;

export async function attachPasskeyIfAny(page: Page, email: string): Promise<void> {
  if (!ADMIN_PASSKEY || email.toLowerCase() !== ADMIN_PASSKEY.email) return;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  await cdp.send("WebAuthn.addCredential", {
    authenticatorId,
    credential: {
      credentialId: Buffer.from(ADMIN_PASSKEY.id, "base64url").toString("base64"),
      isResidentCredential: true,
      rpId: ADMIN_PASSKEY.rpId,
      privateKey: ADMIN_PASSKEY.privateKey,
      userHandle: Buffer.from("pharmachain-e2e-platform-admin").toString("base64"),
      signCount: Math.floor(Date.now() / 1000) + passkeyUses++,
    },
  });
}

async function captureSession(
  browser: Browser,
  email: string,
  password: string,
): Promise<StorageState> {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await attachPasskeyIfAny(page, email);
  await gotoResilient(page, "/login");
  await page.getByLabel("Work email").fill(email);
  // `exact` matters: the field carries a show/hide toggle labelled "Show
  // password", and Playwright matches accessible names by substring — a bare
  // getByLabel("Password") resolves to both and fails strict mode.
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  const state = await ctx.storageState();
  await ctx.close();
  fs.mkdirSync(SESSION_DIR, { recursive: true });
  fs.writeFileSync(sessionFile(email), JSON.stringify(state));
  return state;
}

export async function signIn(
  browser: Browser,
  email: string,
  password: string = DEMO_PASSWORD,
): Promise<Page> {
  const openWith = async (state: StorageState) =>
    (await browser.newContext({ storageState: state })).newPage();

  const cached = readCachedSession(email);
  if (cached) {
    const page = await openWith(cached);
    await gotoResilient(page, "/dashboard");
    // A cached session can still be revoked (deactivation, sessionVersion
    // bump). If it bounced to /login, fall through to a real sign-in.
    if (/\/dashboard/.test(page.url())) return page;
    await page.context().close();
  }

  const page = await openWith(await captureSession(browser, email, password));
  await gotoResilient(page, "/dashboard");
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  return page;
}

/** Signs in without touching the cache — for tests that need the login form
 *  itself, or a session created after some clock/state manipulation. */
export async function signInFresh(
  browser: Browser,
  email: string,
  password: string = DEMO_PASSWORD,
): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await attachPasskeyIfAny(page, email);
  await gotoResilient(page, "/login");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });
  return page;
}

/** Navigate and assert: page loaded, no error boundary, expected content shown. */
export async function visit(page: Page, path: string, expected: RegExp | string): Promise<void> {
  await page.goto(path, { waitUntil: "domcontentloaded" });
  await expect(page.getByText(ERROR_BOUNDARY)).toHaveCount(0);
  await expect(page.getByText(expected).first()).toBeVisible({ timeout: 15_000 });
}

/** First id from a list endpoint, or undefined when the list is empty. */
export async function firstId(page: Page, path: string, key = "id"): Promise<string | undefined> {
  const res = await page.request.get(`${API_PATH}${path}`);
  if (res.status() !== 200) return undefined;
  const body = await res.json();
  const arr = Array.isArray(body) ? body : (body.items ?? []);
  return arr[0]?.[key];
}

const PROXY_SECRET = process.env.E2E_PROXY_SECRET
  ? createHmac("sha256", process.env.E2E_PROXY_SECRET)
      .update("pharmachain/proxy-identity/v1")
      .digest("hex")
  : "";
let registerCalls = 0;

/**
 * Registers a company through the public endpoint without spending the shared
 * budget. Registration is throttled to 10 per hour per client IP, and every
 * spec that registers from the same machine shares one IP — a few runs in an
 * hour starved the *other* specs' registration case with a 429. When the
 * deployment's AUTH_SECRET is available (E2E_PROXY_SECRET) each call pins its
 * own client IP, exactly as regression.spec.ts does; without it the call goes
 * out as-is and the budget is what it is.
 */
export async function registerCompany(page: Page, data: unknown): Promise<APIResponse> {
  const base = process.env.E2E_API_ORIGIN ?? `${process.env.E2E_BASE_URL ?? ""}${API_PATH}`;
  registerCalls += 1;
  const octet = ((Date.now() + registerCalls * 7) % 250) + 1;
  return page.request.post(`${base}/auth/register`, {
    data,
    headers: PROXY_SECRET
      ? { "x-client-ip": `198.51.100.${octet}`, "x-proxy-secret": PROXY_SECRET }
      : {},
  });
}

/**
 * Top up the shared demo companies' monthly freemium allowance through the real
 * US-907 flow (the company admin requests credits, the super admin confirms), so
 * a spec that raises RFQs or quotes does not fail at LIMIT_REACHED mid-month on
 * a dataset that only grows across runs. The golden path does the same inline.
 */
export async function topUpCredits(
  browser: Browser,
  requests: Array<{ email: string; kind: "RFQ" | "QUOTATION"; count: number }>,
): Promise<void> {
  const ids: string[] = [];
  for (const { email, kind, count } of requests) {
    const page = await signIn(browser, email);
    const res = await page.request.post(`${API_PATH}/billing/credit-requests`, {
      data: { kind, count },
    });
    expect(res.ok(), `credit request (${kind}) for ${email}: ${res.status()}`).toBeTruthy();
    ids.push((await res.json()).id as string);
    await page.context().close();
  }
  const admin = await signIn(browser, "admin@pharmachain.local", ADMIN_PASSWORD);
  for (const id of ids) {
    const res = await admin.request.post(`${API_PATH}/admin/credit-requests/${id}/decide`, {
      data: { decision: "CONFIRM" },
    });
    expect(res.ok(), `confirm credit request ${id}`).toBeTruthy();
  }
  await admin.context().close();
}

/**
 * Where a test RFQ can go without reaching anyone real. Since RFQs are
 * delivered (2026-10-29), every RFQ the suite raises is emailed to each verified
 * supplier it targets — on a deployed stack that includes real companies. A
 * category in which only the demo supplier publishes narrows delivery to it;
 * this finds one at run time (who lists where changes), by asking the API the
 * same reach question the RFQ form asks. Null when none exists: callers raising
 * RFQs against a deployed stack must then skip, not notify strangers.
 */
export async function quietRfqTarget(
  buyer: Page,
  supplier: Page,
): Promise<{ targetCompanyType: string; categoryId?: string } | null> {
  const me = await (await supplier.request.get(`${API_PATH}/auth/me`)).json();
  const targetCompanyType = me?.membership?.companyType as string;
  const mine = await (await supplier.request.get(`${API_PATH}/catalogue?pageSize=100`)).json();
  const listings = (Array.isArray(mine) ? mine : (mine.items ?? [])) as Array<{
    status: string;
    categoryId: string;
  }>;
  const categories = [
    ...new Set(listings.filter((l) => l.status === "PUBLISHED").map((l) => l.categoryId)),
  ];
  for (const categoryId of categories) {
    const reach = await (
      await buyer.request.get(
        `${API_PATH}/rfqs/reach?targetCompanyType=${targetCompanyType}&categoryId=${categoryId}`,
      )
    ).json();
    if (reach.inCategory === 1) return { targetCompanyType, categoryId };
  }
  // Locally every supplier is a seeded demo company, so no category is needed.
  return LOCAL_TARGET ? { targetCompanyType } : null;
}

export const QUIET_TARGET_SKIP =
  "no category reaches only the demo supplier on this deployment; raising an RFQ would notify real suppliers";
