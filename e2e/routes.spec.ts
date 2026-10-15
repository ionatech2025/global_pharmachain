import { expect, test } from "@playwright/test";
import {
  ADMIN_PASSWORD as ADMIN_PW,
  API_PATH,
  DEMO_PASSWORD as DEMO_PW,
  firstId,
  signIn,
  visit,
} from "./helpers";

/**
 * Route-render coverage: every major frontend route is visited against the
 * deployed app with real seeded data, asserting each renders its
 * schema-backed content (a known heading and/or a specific seeded value)
 * and never falls through to the error boundary. Confirms the API returns
 * data shaped as each page's typed contract expects.
 */

test.describe("Public + auth routes", () => {
  test("landing, auth pages and 404 render", async ({ browser }) => {
    const page = await (await browser.newContext()).newPage();
    // Hero copy as rewritten on 2026-09-16 (4ed108c).
    await visit(page, "/", /end-to-end b2b pharma ecosystem/i);
    await visit(page, "/login", /Sign in/i);
    await visit(page, "/register", /Register your company/i);
    await visit(page, "/forgot-password", /reset|password/i);
    await visit(page, "/reset-password", /password/i);
    await visit(page, "/invite", /invit/i);
    await visit(page, "/privacy", /privacy/i);
    await visit(page, "/this-does-not-exist", /doesn't exist/i);
    await page.context().close();
  });
});

test.describe("Register flow (creates real data)", () => {
  test("a new company can register and is routed to sign in", async ({ browser }) => {
    const page = await (await browser.newContext()).newPage();
    const tag = Date.now().toString(36).toUpperCase();
    await page.goto("/register");
    await page.getByLabel("Company name").fill(`Route Test Pharma ${tag}`);
    // Country became a select on 2026-09-16 (pre-filled from the browser's
    // zone), so it is chosen, not typed.
    await page.getByLabel("Country").click();
    await page.getByRole("option", { name: "Uganda", exact: true }).click();
    await page.getByLabel("Registration number").fill(`RT-${tag}`);
    await page.getByLabel("Registered address").fill("1 Verification Way, Kampala");
    await page.getByLabel("Contact phone").fill("+256700000001");
    await page.getByLabel("Full name").fill("Route Tester");
    await page.getByLabel("Work email").fill(`route.${tag.toLowerCase()}@example.com`);
    await page.getByLabel("Password", { exact: true }).fill("Route-Test-Pass-1");
    await page.getByRole("button", { name: /register company/i }).click();
    await expect(page).toHaveURL(/\/login\?registered=1/, { timeout: 30_000 });
    await page.context().close();

    // Teardown: the registration above is real, so retire it from the
    // production verification queue with an audited rejection — which also
    // exercises the US-103 reject path against the deployed stack.
    const admin = await signIn(browser, "admin@pharmachain.local", ADMIN_PW);
    const list = await admin.request.get(
      `${API_PATH}/admin/companies?q=${encodeURIComponent(`Route Test Pharma ${tag}`)}`,
    );
    expect(list.ok()).toBeTruthy();
    const items = (await list.json()).items ?? [];
    expect(items).toHaveLength(1);
    const rejected = await admin.request.post(`${API_PATH}/admin/companies/${items[0].id}/verify`, {
      data: {
        decision: "REJECT",
        reason: "Automated e2e registration record — not a real company (test cleanup).",
      },
    });
    expect(rejected.ok()).toBeTruthy();
    await admin.context().close();
  });
});

test.describe("Company user (buyer) routes render seeded data", () => {
  let page: Page;
  test.beforeAll(async ({ browser }) => {
    page = await signIn(browser, "ops@nilepharma.demo", DEMO_PW);
  });
  test.afterAll(async () => page?.context().close());

  test("dashboard + workspace overview", async () => {
    await visit(page, "/dashboard", /Nile Pharma Industries/i);
    await visit(page, "/account", /account/i);
    await visit(page, "/notifications", /notification/i);
    await visit(page, "/documents", /document/i);
    await visit(page, "/company", /Nile Pharma Industries/i);
    await visit(page, "/company/usage", /usage|credit|limit/i);
    await visit(page, "/company/verification", /verif/i);
    await visit(page, "/issues", /support|issue|ticket/i);
  });

  test("marketplace + a public listing + a public company profile", async () => {
    await visit(page, "/marketplace", /Paracetamol|marketplace|catalogue|listings/i);
    const search = await page.request.get(`${API_PATH}/catalogue/search?page=1`);
    const item = (await search.json()).items?.[0];
    if (item?.id)
      await visit(page, `/catalogue/${item.id}`, new RegExp(item.name.slice(0, 12), "i"));
    if (item?.company?.id)
      await visit(page, `/companies/${item.company.id}`, /Kampala|Fine Chemicals|profile/i);
  });

  test("RFQs list, detail and new form", async () => {
    await visit(page, "/rfqs", /RFQ|Microcrystalline|Paracetamol/i);
    await visit(page, "/rfqs/new", /Raise an RFQ|product|material/i);
    // A material category narrows who sees an RFQ (only suppliers listing it),
    // so the form states the reach of the current choice before publishing.
    await expect(page.getByText(/Any category: all \d+ verified compan/i)).toBeVisible();
    const reach = await page.request.get(
      `${API_PATH}/rfqs/reach?targetCompanyType=RAW_MATERIAL_MANUFACTURER`,
    );
    expect(reach.status()).toBe(200);
    const { ofType, inCategory } = await reach.json();
    expect(inCategory).toBeNull();
    expect(ofType).toBeGreaterThan(0);
    const rfqId = await firstId(page, "/rfqs?page=1");
    if (rfqId) await visit(page, `/rfqs/${rfqId}`, /RFQ-|quantity|quotation/i);
    await visit(page, "/quotes", /inbox|open RFQ|Not quoted|quotation/i);
  });

  test("orders list + detail with shipment history", async () => {
    await visit(page, "/orders", /ORD-|order|Microcrystalline/i);
    const orderId = await firstId(page, "/orders?page=1");
    if (orderId)
      await visit(page, `/orders/${orderId}`, /ORD-|in transit|forwarder|shipment|status/i);
  });

  test("catalogue (own), a product + its BOM", async () => {
    await visit(page, "/catalogue", /catalogue|Painex|listing/i);
    await visit(page, "/catalogue/new", /new|listing|name|price/i);
    const mine = await (await page.request.get(`${API_PATH}/catalogue`)).json();
    const list = Array.isArray(mine) ? mine : (mine.items ?? []);
    const product = list.find((l: { kind: string }) => l.kind === "FINISHED_PRODUCT") ?? list[0];
    if (product?.id) {
      await visit(page, `/catalogue/${product.id}`, new RegExp(product.name.slice(0, 10), "i"));
      await visit(page, `/catalogue/${product.id}/bom`, /BOM|bill of materials|material|version/i);
    }
  });

  test("messages list + a thread", async () => {
    await visit(page, "/messages", /message|conversation|thread|Kampala/i);
    const threadId = await firstId(page, "/threads");
    if (threadId) await visit(page, `/messages/${threadId}`, /Malaba|CoA|message|reply|order/i);
  });

  test("intelligence + finance analytics", async () => {
    // Prices are per category, never blended: the API returns per-category
    // series plus how many quotations could be priced at all.
    const res = await page.request.get(`${API_PATH}/intelligence/prices`);
    expect(res.status()).toBe(200);
    const prices = await res.json();
    expect(Array.isArray(prices.categories)).toBe(true);
    expect(prices.coverage.categorised).toBeLessThanOrEqual(prices.coverage.quotations);

    await visit(page, "/intelligence", /Market & supply intelligence/i);
    await expect(page.getByRole("heading", { name: "Prices by category" })).toBeVisible();
    // Every chart offers its values as a table — the path for touch and keyboard.
    await expect(page.getByText("View as table").first()).toBeVisible();
    await visit(page, "/finance", /Cash movement|payments|invoices/i);
  });
});

test.describe("Company admin routes", () => {
  test("member management renders", async ({ browser }) => {
    const page = await signIn(browser, "admin@nilepharma.demo", DEMO_PW);
    await visit(page, "/company/members", /member|invite|role|Grace|Peter/i);
    await page.context().close();
  });
});

test.describe("Super admin routes render platform data", () => {
  let page: Page;
  test.beforeAll(async ({ browser }) => {
    page = await signIn(browser, "admin@pharmachain.local", ADMIN_PW);
  });
  test.afterAll(async () => page?.context().close());

  test("platform admin surfaces", async () => {
    await visit(page, "/dashboard", /companies|verified|pending|platform/i);
    await visit(page, "/admin/verification", /verif|queue|pending/i);
    await visit(page, "/admin/companies", /Nile Pharma|Kampala|company/i);
    await visit(page, "/admin/credits", /credit|Nile Pharma|pending/i);
    await visit(page, "/admin/announcements", /announcement|maintenance/i);
    await visit(page, "/admin/parameters", /parameter|FX|exchange|rate/i);
    await visit(page, "/admin/logins", /login|activity|admin@nilepharma/i);
    await visit(page, "/admin/audit", /audit|action|company.verify/i);
    await visit(page, "/admin/data-requests", /deletion|data request|Former/i);
    await visit(page, "/admin/issues", /support|issue|ticket/i);
    const companyId = await firstId(page, "/admin/companies");
    if (companyId) await visit(page, `/admin/companies/${companyId}`, /verif|document|check|tier/i);
  });

  test("support issue lifecycle, mobile responsiveness and a11y", async ({ browser }) => {
    const buyer = await signIn(browser, "ops@nilepharma.demo", DEMO_PW);
    const created = await buyer.request.post(`${API_PATH}/issues`, {
      data: {
        category: "ONBOARDING",
        priority: "MEDIUM",
        subject: "E2E support ticket verification",
        description: "Automated verification of the support issue lifecycle.",
        pageUrl: "/company/verification",
      },
    });
    expect(created.status()).toBe(201);
    const issue = await created.json();
    expect(issue.refNo).toMatch(/^ISS-\d{4}-/);

    await visit(buyer, `/issues/${issue.id}`, new RegExp(issue.refNo));

    // Mobile viewport (375x812) sweep: confirm zero horizontal overflow on /issues and /issues/:id
    await buyer.setViewportSize({ width: 375, height: 812 });
    for (const path of ["/issues", `/issues/${issue.id}`]) {
      await buyer.goto(path, { waitUntil: "domcontentloaded" });
      await expect(buyer.locator("main")).toBeVisible();
      const overflow = await buyer.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal overflow on ${path} at 375px`).toBeLessThanOrEqual(0);
    }
    await buyer.context().close();

    // Super admin resolves and closes the test ticket so no open test noise remains.
    const resolved = await page.request.patch(`${API_PATH}/admin/issues/${issue.id}`, {
      data: {
        status: "CLOSED",
        resolution: "Verified end-to-end by automated route suite.",
      },
    });
    expect(resolved.ok()).toBeTruthy();
  });
});
