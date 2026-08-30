import { type APIResponse, expect, type Page, test } from "@playwright/test";
import {
  ADMIN_PASSWORD,
  API_PATH,
  DEMO_PASSWORD,
  gotoResilient,
  signIn,
  signInFresh,
} from "./helpers";
import { createMailbox, linkIn, type Mailbox, waitForEmail } from "./mailbox";

/**
 * Epic 2 — User Management & RBAC, end to end against the deployed stack.
 *
 * Written against the QA round that reported US-201…US-205 as failing with
 * "user doesn't receive email" / "no email" against nearly every case. The
 * mail did leave the system; what was missing was any way to see that from
 * either side, so the whole epic read as broken. These cases assert the
 * acceptance criteria themselves — a real invitation read out of a real
 * inbox, the account it creates, the rules that then apply to it — rather
 * than the API's own opinion of what it did.
 *
 * Serial and stateful by design: one invited account is walked through
 * registration, deactivation, an admin override and two role changes, which
 * is both the cheapest way to cover the epic and the least demo data left
 * behind on a long-lived deployment.
 */

const BUYER_ADMIN = "admin@nilepharma.demo";
const SUPPLIER_ADMIN = "admin@kampalafinechem.demo";
const SUPPLIER_OPS = "ops@kampalafinechem.demo";
const SUPER_ADMIN = "admin@pharmachain.local";
const NEW_PASSWORD = "Recruit-Pass-1";

/** Shared across the serial cases below. */
const invited: {
  mailbox: Mailbox | null;
  userId?: string;
  companyName?: string;
} = { mailbox: null };

/**
 * Ordered, not serial. The suite already runs single-worker in file order, so
 * the chain still holds — but Playwright's "serial" mode aborts every
 * remaining test the moment one fails, which turned a single slow mail poll
 * into fifteen cases that never ran. The dependent cases guard themselves on
 * the state they need instead, so an unrelated failure costs only itself.
 */

/** Waiting on a real relay and a real inbox is minutes, not seconds. */
const MAIL_TIMEOUT_MS = 240_000;

/**
 * A GET that survives the link, not just the server.
 *
 * Runs against a deployed target have died on `getaddrinfo EAI_AGAIN` partway
 * through an otherwise passing case — the invitation had been emailed, opened
 * and accepted, and a dropped DNS lookup on the next call reported it as an
 * Epic 2 failure. Retry the transport so a red result means the product.
 */
interface Me {
  id: string;
  email: string;
  membership?: { role: string; companyName: string; companyType: string };
}

type Method = "get" | "post" | "patch";

/** DNS and connect-stage failures: nothing reached the server, so a retry
 *  cannot duplicate a write. Seen constantly against a deployed target from a
 *  machine whose resolver is unreliable. */
const NEVER_SENT = /EAI_AGAIN|ENOTFOUND|getaddrinfo|ECONNREFUSED|ConnectTimeout|ETIMEDOUT/i;

async function req(
  page: Page,
  method: Method,
  path: string,
  options?: { data?: unknown; params?: Record<string, string> },
  attempts = 4,
): Promise<APIResponse> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await page.request[method](path, options);
    } catch (err) {
      // Only failures that prove the request never left this machine are
      // retried. An HTTP status — 403 included — is an answer, not an error,
      // and comes back as a resolved response. Retrying anything vaguer would
      // risk replaying a POST the server had in fact received, and these
      // cases raise RFQs and invitations that must not be created twice.
      if (!NEVER_SENT.test(String((err as Error)?.message ?? err))) throw err;
      lastError = err;
      await new Promise((resolve) => setTimeout(resolve, 1_000 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function getJson<T>(page: Page, path: string): Promise<T> {
  return (await (await req(page, "get", path)).json()) as T;
}

test.describe("US-201 invitation and registration", () => {
  test("case 21: an invited colleague is emailed a link, and it activates a company-scoped account", async ({
    browser,
  }) => {
    test.setTimeout(MAIL_TIMEOUT_MS);
    invited.mailbox = await createMailbox("qa-epic2");
    test.skip(!invited.mailbox, "disposable mail service unreachable");
    const mailbox = invited.mailbox as Mailbox;

    const admin = await signIn(browser, SUPPLIER_ADMIN, DEMO_PASSWORD);
    const created = await req(admin, "post", `${API_PATH}/companies/me/invites`, {
      data: { email: mailbox.address, role: "OPERATIONS" },
    });
    expect(created.status(), await created.text()).toBe(201);
    const body = await created.json();

    // The API now says whether the relay actually took the message, so a
    // silent failure can no longer masquerade as a sent invitation.
    expect(body.emailSent, "the API reported the invitation email as undelivered").toBe(true);
    expect(body.tokenHash, "the invitation token hash must not reach the client").toBeUndefined();

    const mail = await waitForEmail(mailbox, /invitation to join/i);
    expect(mail, "no invitation email arrived within the timeout").toBeTruthy();
    const url = linkIn(mail as string, "/invite");
    expect(url, "the invitation email carried no /invite link").toBeTruthy();

    // Register through the link exactly as the invited user would.
    const page = await (await browser.newContext()).newPage();
    await gotoResilient(page, url as string);
    await page.getByLabel("Full name").fill("QA Epic2 Recruit");
    await page.getByLabel("Choose a password").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Join company" }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 30_000 });

    // Company-scoped: they land inside the inviting company, as the role they
    // were invited with — not as an unattached user.
    const me = await getJson<Me>(page, `${API_PATH}/auth/me`);
    expect(me.membership?.role).toBe("OPERATIONS");
    expect(me.membership?.companyName).toBe("Kampala Fine Chemicals Ltd");
    expect(me.email).toBe(mailbox.address.toLowerCase());
    invited.userId = me.id;
    invited.companyName = me.membership?.companyName;
    await page.context().close();
  });

  test("case 22: a link that is no longer valid is refused on the page, with the reason", async ({
    browser,
  }) => {
    // A live 72-hour expiry cannot be waited out against a deployed stack, so
    // this drives the same rejection path with a token the server refuses and
    // asserts what QA could not confirm: that the refusal is *shown*, on the
    // page, instead of a toast that fades while the form sits there looking
    // usable. (The expiry branch itself is unit-covered in the API.)
    const page = await (await browser.newContext()).newPage();
    await gotoResilient(page, "/invite?token=expired-or-revoked-token");
    await page.getByLabel("Full name").fill("QA Epic2 Late");
    await page.getByLabel("Choose a password").fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Join company" }).click();

    await expect(page.getByText(/this invitation can.t be used/i)).toBeVisible();
    await expect(page.getByText(/no longer valid|expired/i).first()).toBeVisible();
    await expect(page.getByText(/expire 72 hours after/i)).toBeVisible();
    // The dead form is gone, not left inviting another doomed attempt.
    await expect(page.getByRole("button", { name: "Join company" })).toHaveCount(0);
    await page.context().close();
  });

  test("case 23: an email already active in another company is refused with a clear conflict", async ({
    browser,
  }) => {
    const admin = await signIn(browser, SUPPLIER_ADMIN, DEMO_PASSWORD);
    const res = await req(admin, "post", `${API_PATH}/companies/me/invites`, {
      data: { email: BUYER_ADMIN, role: "OPERATIONS" },
    });
    expect(res.status()).toBe(409);
    expect((await res.json()).error.message).toMatch(/already registered to a company/i);
  });
});

test.describe("US-202 deactivation", () => {
  /** Something worth preserving across the deactivation: a real quotation the
   *  invited member filed on somebody else's RFQ. */
  const QUOTE_NOTE = "QA Epic2 pre-deactivation quotation";
  const QUOTE_UNIT_PRICE = "9.50";
  /** How fmtMoney renders it: currency code, not a symbol. */
  const QUOTE_UNIT_PRICE_DISPLAY = "USD 9.50";
  let rfqId: string | undefined;

  test("the invited member first files a quotation, so there is history to keep", async ({
    browser,
  }) => {
    test.skip(!invited.userId, "no invited account was created");
    const recruit = await signInFresh(browser, invited.mailbox?.address as string, NEW_PASSWORD);
    const buyer = await signIn(browser, BUYER_ADMIN, DEMO_PASSWORD);

    // An RFQ only accepts quotations from the company type it targets, so aim
    // it at whatever this company actually is rather than guessing.
    const me = await getJson<Me>(recruit, `${API_PATH}/auth/me`);
    const raised = await req(buyer, "post", `${API_PATH}/rfqs`, {
      data: {
        title: `QA Epic2 history ${Date.now().toString(36).toUpperCase()}`,
        quantity: "5",
        unit: "kg",
        targetCompanyType: me.membership.companyType,
        deadline: new Date(Date.now() + 10 * 864e5).toISOString(),
      },
    });
    expect(raised.ok(), `could not raise a fixture RFQ (HTTP ${raised.status()})`).toBe(true);
    rfqId = (await raised.json()).id;

    const quoted = await req(recruit, "post", `${API_PATH}/rfqs/${rfqId}/quotations`, {
      data: {
        unitPrice: QUOTE_UNIT_PRICE,
        currency: "USD",
        leadTimeDays: 14,
        validUntil: new Date(Date.now() + 30 * 864e5).toISOString(),
        notes: QUOTE_NOTE,
      },
    });
    expect(quoted.ok(), `could not submit the fixture quotation (HTTP ${quoted.status()})`).toBe(
      true,
    );
    await recruit.context().close();
  });

  test("case 24: a deactivated member reads as Inactive and cannot sign in again", async ({
    browser,
  }) => {
    test.skip(!invited.userId, "no invited account was created");
    const admin = await signIn(browser, SUPPLIER_ADMIN, DEMO_PASSWORD);
    const off = await req(
      admin,
      "post",
      `${API_PATH}/companies/me/members/${invited.userId}/deactivate`,
    );
    expect(off.ok(), await off.text()).toBe(true);

    await admin.goto("/company/members");
    const row = admin.locator("tr", { hasText: invited.mailbox?.address as string });
    await expect(row).toBeVisible();
    // US-202 asks for "Inactive" — the enum's own "Deactivated" used to leak
    // through the badge instead.
    await expect(row).toContainText("Inactive");

    // And the block is real, not just a label.
    const page = await (await browser.newContext()).newPage();
    await gotoResilient(page, "/login");
    await page.getByLabel("Work email").fill(invited.mailbox?.address as string);
    await page.getByLabel("Password", { exact: true }).fill(NEW_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).not.toHaveURL(/\/dashboard/, { timeout: 15_000 });
    await expect(
      page.getByText(/invalid email or password|deactivated|no longer/i).first(),
    ).toBeVisible();
    await page.context().close();
  });

  test("case 26: their past RFQ response is still there afterwards", async ({ browser }) => {
    test.skip(!rfqId, "no fixture quotation was filed");
    const buyer = await signIn(browser, BUYER_ADMIN, DEMO_PASSWORD);
    const quotes = await getJson<{ items?: { notes?: string }[] }>(
      buyer,
      `${API_PATH}/rfqs/${rfqId}/quotations`,
    );
    const items = quotes.items ?? quotes;
    expect(
      items.some((q: { notes?: string }) => q.notes === QUOTE_NOTE),
      "the deactivated member's quotation vanished from the RFQ",
    ).toBe(true);

    // And the buyer still sees it on the RFQ page. The quotations table shows
    // the supplier, the price and the status — not the private notes the
    // supplier typed, which only ever appear in their own submit form — so
    // assert on what a buyer actually reads. This RFQ was raised by this run
    // and carries exactly one quotation, so the count is unambiguous.
    await gotoResilient(buyer, `/rfqs/${rfqId}`);
    await expect(buyer.getByText(/Quotations \(1\)/)).toBeVisible();
    await expect(
      buyer.getByRole("link", { name: "Kampala Fine Chemicals Ltd" }).first(),
    ).toBeVisible();
    await expect(buyer.getByText(QUOTE_UNIT_PRICE_DISPLAY)).toBeVisible();
  });

  test("case 25: the last active Company Admin is told why they cannot deactivate themselves", async ({
    browser,
  }) => {
    const admin = await signIn(browser, SUPPLIER_ADMIN, DEMO_PASSWORD);
    await admin.goto("/company/members");

    const ownRow = admin.locator("tr", { hasText: SUPPLIER_ADMIN });
    await expect(ownRow.getByRole("button", { name: "Deactivate" })).toBeDisabled();
    await expect(ownRow).toContainText(/only active Company Admin|can't deactivate your own/i);

    // The server holds the same line, whatever the UI offers.
    const me = await getJson<Me>(admin, `${API_PATH}/auth/me`);
    const res = await req(admin, "post", `${API_PATH}/companies/me/members/${me.id}/deactivate`);
    expect(res.ok()).toBe(false);
    expect((await res.json()).error.message).toMatch(/admin|yourself|last/i);
  });
});

test.describe("US-203 platform-admin overrides", () => {
  test("case 29: an override without a reason is refused until one is given", async ({
    browser,
  }) => {
    test.skip(!invited.userId, "no invited account was created");
    const admin = await signIn(browser, SUPER_ADMIN, ADMIN_PASSWORD);

    for (const data of [{}, { reason: "" }, { reason: "no" }]) {
      const res = await req(
        admin,
        "post",
        `${API_PATH}/admin/users/${invited.userId}/reset-password`,
        {
          data,
        },
      );
      expect(res.status(), `reason ${JSON.stringify(data)} should be refused`).toBe(400);
    }
  });

  test("case 27: a reset with a reason emails the user and lands in the audit log", async ({
    browser,
  }) => {
    test.setTimeout(MAIL_TIMEOUT_MS);
    test.skip(!invited.mailbox, "no invited account was created");
    const admin = await signIn(browser, SUPER_ADMIN, ADMIN_PASSWORD);

    const reason = "QA Epic2: locked-out admin asked for a reset";
    const res = await req(
      admin,
      "post",
      `${API_PATH}/admin/users/${invited.userId}/reset-password`,
      {
        data: { reason },
      },
    );
    expect(res.status(), await res.text()).toBe(200);
    expect((await res.json()).emailSent, "the reset email was reported undelivered").toBe(true);

    const mail = await waitForEmail(invited.mailbox as Mailbox, /reset/i);
    expect(mail, "no password-reset email arrived").toBeTruthy();
    expect(linkIn(mail as string, "/reset-password"), "no reset link in the email").toBeTruthy();

    // Audit: the action, the target and the operator's stated reason.
    const audit = await (
      await req(admin, "get", `${API_PATH}/admin/audit-logs`, {
        params: { entityType: "User", actorEmail: SUPER_ADMIN },
      })
    ).json();
    const entry = (audit.items ?? audit).find(
      (a: { entityId: string; action: string }) =>
        a.entityId === invited.userId && a.action === "admin.user-password-reset",
    );
    expect(entry, "no audit entry for the password reset").toBeTruthy();
    expect(entry.reason).toBe(reason);
    expect(entry.actorEmail).toBe(SUPER_ADMIN);
  });

  test("case 28: a reassigned Company Admin gains the access the role carries", async ({
    browser,
  }) => {
    test.skip(!invited.userId, "no invited account was created");
    const admin = await signIn(browser, SUPER_ADMIN, ADMIN_PASSWORD);

    // Reactivate first: the account was deactivated in case 24, and an admin
    // reassigning a role to a signed-out account is the scenario's premise.
    const on = await req(admin, "post", `${API_PATH}/admin/users/${invited.userId}/reactivate`, {
      data: { reason: "QA Epic2: restoring the account to reassign it" },
    });
    expect(on.status(), await on.text()).toBe(200);

    const res = await req(admin, "post", `${API_PATH}/admin/users/${invited.userId}/role`, {
      data: { role: "COMPANY_ADMIN", reason: "QA Epic2: company left without an active admin" },
    });
    expect(res.status(), await res.text()).toBe(200);

    // The new admin can now do what only an admin can: manage members.
    const promoted = await signInFresh(browser, invited.mailbox?.address as string, NEW_PASSWORD);
    const members = await req(promoted, "get", `${API_PATH}/companies/me/members`);
    expect(members.status(), "the promoted admin cannot read the member list").toBe(200);
    await promoted.goto("/company/members");
    await expect(promoted.getByText("Invite a colleague")).toBeVisible();
    await promoted.context().close();
  });
});

test.describe("US-204 role-based access control", () => {
  test("case 32: a Company Admin has full access to the member management page", async ({
    browser,
  }) => {
    const admin = await signIn(browser, SUPPLIER_ADMIN, DEMO_PASSWORD);
    await admin.goto("/company/members");
    await expect(admin.getByText("Invite a colleague")).toBeVisible();
    await expect(admin.getByRole("button", { name: "Send invite" })).toBeEnabled();
    // Deactivate is offered on somebody else's row (their own is the guarded one).
    const other = admin.locator("tr", { hasText: SUPPLIER_OPS });
    await expect(other.getByRole("button", { name: "Deactivate" })).toBeEnabled();
  });

  test("case 30: Operations Staff is refused company billing and admin settings", async ({
    browser,
  }) => {
    const ops = await signIn(browser, SUPPLIER_OPS, DEMO_PASSWORD);

    // Server-side: buying credits is a company:manage action.
    const credits = await req(ops, "post", `${API_PATH}/billing/credit-requests`, {
      data: { kind: "RFQ", count: 1 },
    });
    expect(credits.status()).toBe(403);

    // And the UI says so plainly instead of throwing a generic error.
    await ops.goto("/company/members");
    await expect(ops).toHaveURL(/\/forbidden/);
    await expect(ops.getByText(/not authorised to view this/i)).toBeVisible();
    await expect(ops.getByText(/role doesn't include access/i)).toBeVisible();
  });

  test("case 31: Finance Staff cannot create a product listing, whatever the UI offers", async ({
    browser,
  }) => {
    test.skip(!invited.userId, "no invited account was created");
    const admin = await signIn(browser, SUPER_ADMIN, ADMIN_PASSWORD);
    const moved = await req(admin, "post", `${API_PATH}/admin/users/${invited.userId}/role`, {
      data: { role: "FINANCE", reason: "QA Epic2: checking finance-role limits" },
    });
    expect(moved.status(), await moved.text()).toBe(200);

    const finance = await signInFresh(browser, invited.mailbox?.address as string, NEW_PASSWORD);
    const listing = await req(finance, "post", `${API_PATH}/catalogue`, {
      data: {
        name: "QA Epic2 listing that must never exist",
        kind: "RAW_MATERIAL",
        unit: "kg",
      },
    });
    // Refused on role before the payload is ever considered.
    expect(listing.status()).toBe(403);
    await finance.context().close();
  });

  test("case 33: a valid session with the wrong role gets 403 from the API, not 200", async ({
    browser,
  }) => {
    const ops = await signIn(browser, SUPPLIER_OPS, DEMO_PASSWORD);
    // A live session — the same one that reads its own company perfectly well.
    expect((await req(ops, "get", `${API_PATH}/companies/me`)).status()).toBe(200);

    for (const call of [
      req(ops, "get", `${API_PATH}/companies/me/members`),
      req(ops, "get", `${API_PATH}/companies/me/invites`),
      req(ops, "post", `${API_PATH}/companies/me/invites`, {
        data: { email: "nobody@example.com", role: "OPERATIONS" },
      }),
    ]) {
      const res = await call;
      expect(res.status(), `${res.url()} answered ${res.status()}`).toBe(403);
    }

    // Platform-admin surfaces are closed to a company session too.
    expect((await req(ops, "get", `${API_PATH}/admin/login-activity`)).status()).toBe(403);
  });
});

test.describe("US-205 login auditing", () => {
  test("case 34: a sign-in is logged with correct metadata, at the viewer's own clock time", async ({
    browser,
  }) => {
    const at = new Date();
    await signInFresh(browser, BUYER_ADMIN, DEMO_PASSWORD);

    const admin = await signIn(browser, SUPER_ADMIN, ADMIN_PASSWORD);
    await admin.goto(`/admin/logins?email=${encodeURIComponent(BUYER_ADMIN)}`);

    const first = admin.locator("tbody tr").first();
    await expect(first).toContainText(BUYER_ADMIN);
    await expect(first).toContainText("PASSWORD");
    await expect(first).toContainText("success");
    // Metadata, not blanks: the request's IP and user agent were recorded.
    await expect(first.locator("td").nth(4)).not.toHaveText("—");
    await expect(first.locator("td").nth(5)).not.toHaveText("—");

    // The reported time is the viewer's, not the serverless function's. The
    // page used to render every timestamp in UTC for anyone who had not set a
    // time zone in their account, so a Kampala sign-in read three hours early.
    const shown = (await first.locator("td").first().innerText()).trim();
    const inViewerZone = new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(at);
    // Allow the minute to tick over between the sign-in and the assertion.
    const oneMinuteLater = new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(at.getTime() + 60_000));
    expect(
      [inViewerZone, oneMinuteLater],
      `login activity showed "${shown}", expected the viewer's local time`,
    ).toContain(shown);
  });
});

test.describe("cleanup", () => {
  test("the account this run created is stood down, not left active in the demo company", async ({
    browser,
  }) => {
    test.skip(!invited.userId, "no invited account was created");
    const admin = await signIn(browser, SUPER_ADMIN, ADMIN_PASSWORD);
    const res = await req(admin, "post", `${API_PATH}/admin/users/${invited.userId}/deactivate`, {
      data: { reason: "QA Epic2: end of verification run" },
    });
    expect(res.status(), await res.text()).toBe(200);

    // Deactivated members stop counting towards the company's active roster,
    // so repeated runs against a long-lived deployment do not silently pile
    // extra admins into the demo company and change what the next run sees.
    const supplier = await signIn(browser, SUPPLIER_ADMIN, DEMO_PASSWORD);
    const members = await getJson<{ user: { id: string; status: string } }[]>(
      supplier,
      `${API_PATH}/companies/me/members`,
    );
    const left = members.find((m: { user: { id: string } }) => m.user.id === invited.userId);
    expect(left?.user.status).toBe("DEACTIVATED");
  });
});
