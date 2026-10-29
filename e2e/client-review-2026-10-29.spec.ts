import { COMPANY_TYPE_LABELS, COMPANY_TYPES, type CompanyType, fxRate } from "@pharmachain/core";
import { expect, type Page, test } from "@playwright/test";
import {
  ADMIN_PASSWORD,
  API_PATH,
  QUIET_TARGET_SKIP,
  quietRfqTarget,
  signIn,
  topUpCredits,
} from "./helpers";

/**
 * Client review of 2026-10-29 (COMMENTS ON PHARMACHAIN WEBSITE_CLIENT, third
 * edition, pages 19-23). One block per comment, so a regression names the
 * comment it reopens.
 */
const NILE_OPS = "ops@nilepharma.demo";
const NILE_ADMIN = "admin@nilepharma.demo";
const SUPPLIER = "admin@kampalafinechem.demo";
const SUPER_ADMIN = "admin@pharmachain.local";
const runId = Date.now().toString(36).toUpperCase();

async function status(page: Page, path: string): Promise<number> {
  return (await page.request.get(`${API_PATH}${path}`)).status();
}
async function json<T>(page: Page, path: string): Promise<T> {
  const res = await page.request.get(`${API_PATH}${path}`);
  expect(res.ok(), `${path} → ${res.status()}`).toBeTruthy();
  return res.json() as Promise<T>;
}

// ── US-204 TC1: Operations staff and the company's finances ──────────────────

test.describe("US-204 TC1: Operations staff cannot see the company's finances", () => {
  test("the API refuses Operations every finance and billing read, and keeps the usage counters", async ({
    browser,
  }) => {
    const ops = await signIn(browser, NILE_OPS);
    for (const path of [
      "/finance/report",
      "/finance/ledger",
      "/invoices",
      "/billing/credit-requests",
      "/billing/credit-fees",
      "/billing/payment-methods",
    ]) {
      expect(await status(ops, path), `Operations reading ${path}`).toBe(403);
    }
    // What they still need to raise RFQs: this month's allowance.
    expect(await status(ops, "/companies/me/usage")).toBe(200);
    await ops.context().close();
  });

  test("the UI says access is restricted, and does not offer Finance to Operations", async ({
    browser,
  }) => {
    const ops = await signIn(browser, NILE_OPS);
    await expect(ops.getByRole("link", { name: "Finance", exact: true })).toHaveCount(0);
    await ops.goto("/finance");
    await expect(ops).toHaveURL(/\/forbidden/);
    await expect(ops.getByText(/not authorised to view this/i)).toBeVisible();
    await ops.goto("/company/usage", { waitUntil: "domcontentloaded" });
    await expect(ops.getByTestId("billing-restricted")).toContainText("Access restricted");
    await expect(ops.getByText("RFQs created")).toBeVisible();
    await ops.context().close();
  });

  test("the Company Admin keeps finance and billing", async ({ browser }) => {
    const admin = await signIn(browser, NILE_ADMIN);
    for (const path of ["/finance/report", "/invoices", "/billing/credit-requests"]) {
      expect(await status(admin, path), `Company Admin reading ${path}`).toBe(200);
    }
    await expect(admin.getByRole("link", { name: "Finance", exact: true })).toBeVisible();
    await admin.context().close();
  });
});

// ── RFQ visibility, reach and the quote inbox ────────────────────────────────

test.describe
  .serial("RFQs: who they reach, said on both sides; quoted ones leave the inbox", () => {
    let buyer: Page;
    let supplier: Page;
    let rfq: { id: string; refNo: string };

    test.beforeAll(async ({ browser }) => {
      test.setTimeout(180_000);
      buyer = await signIn(browser, NILE_OPS);
      supplier = await signIn(browser, SUPPLIER);
      const quiet = await quietRfqTarget(buyer, supplier);
      test.skip(quiet === null, QUIET_TARGET_SKIP);
      await topUpCredits(browser, [
        { email: NILE_ADMIN, kind: "RFQ", count: 1 },
        { email: SUPPLIER, kind: "QUOTATION", count: 1 },
      ]);
      const res = await buyer.request.post(`${API_PATH}/rfqs`, {
        data: {
          title: `Review 29-Oct ${runId}`,
          quantity: "40",
          unit: "kg",
          deadline: new Date(Date.now() + 5 * 864e5).toISOString(),
          ...quiet,
        },
      });
      expect(res.ok(), await res.text()).toBeTruthy();
      rfq = await res.json();
    });
    test.afterAll(async () => {
      await buyer?.context().close();
      await supplier?.context().close();
    });

    test("the buyer's list says whom each RFQ was sent to", async () => {
      await buyer.goto("/rfqs", { waitUntil: "domcontentloaded" });
      const row = buyer.getByRole("row", { name: new RegExp(rfq.refNo) });
      await expect(row.getByTestId("rfq-reach")).toContainText(/supplier|reached no supplier/);
    });

    test("the supplier's inbox states the rule it applied", async () => {
      await supplier.goto("/quotes", { waitUntil: "domcontentloaded" });
      await expect(supplier.getByTestId("inbox-scope")).toContainText(
        /companies that name no material category/,
      );
      await expect(supplier.getByRole("link", { name: rfq.refNo, exact: true })).toBeVisible();
    });

    test("once quoted, an RFQ leaves 'RFQs to quote on' and is under Quotations sent", async () => {
      const quoted = await supplier.request.post(`${API_PATH}/rfqs/${rfq.id}/quotations`, {
        data: {
          unitPrice: "9.40",
          currency: "USD",
          leadTimeDays: 12,
          validUntil: new Date(Date.now() + 30 * 864e5).toISOString(),
        },
      });
      expect(quoted.ok(), await quoted.text()).toBeTruthy();

      const inbox = await json<{ items: Array<{ id: string }> }>(
        supplier,
        "/rfqs/inbox?pageSize=100",
      );
      expect(inbox.items.map((r) => r.id)).not.toContain(rfq.id);
      const sent = await json<{ items: Array<{ rfq: { id: string } }> }>(
        supplier,
        "/quotations/mine?pageSize=100",
      );
      expect(sent.items.map((q) => q.rfq.id)).toContain(rfq.id);

      await supplier.goto("/quotes", { waitUntil: "domcontentloaded" });
      await expect(supplier.getByRole("link", { name: rfq.refNo, exact: true })).toHaveCount(0);
      await supplier.goto("/quotes?view=sent", { waitUntil: "domcontentloaded" });
      await expect(supplier.getByText(rfq.refNo).first()).toBeVisible();
    });
  });

// ── The RFQ form: each reach notice under the field it is about ─────────────

test("the 'no verified company of this type' warning sits under the type, not the category", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const buyer = await signIn(browser, NILE_OPS);
  // A company type nobody verified belongs to, if there is one on this stack.
  let empty: CompanyType | undefined;
  for (const type of COMPANY_TYPES) {
    const reach = await json<{ ofType: number }>(buyer, `/rfqs/reach?targetCompanyType=${type}`);
    if (reach.ofType === 0) {
      empty = type;
      break;
    }
  }
  await buyer.goto("/rfqs/new");
  // Hydrated once the reach query has answered (see the golden path).
  await expect(buyer.getByTestId("reach-type-notice")).toBeVisible({ timeout: 60_000 });
  // Default type: it has verified companies, so both notices speak.
  await expect(buyer.getByTestId("reach-category-notice")).toContainText(/Any category/);
  test.skip(!empty, "every company type has a verified company on this stack");
  await buyer.getByRole("combobox", { name: "Target supplier category" }).click();
  await buyer
    .getByRole("option", { name: COMPANY_TYPE_LABELS[empty as CompanyType], exact: true })
    .click();
  await expect(buyer.getByTestId("reach-type-notice")).toContainText(
    "No verified company of this type yet",
  );
  // The category field says nothing about a type that reaches nobody.
  await expect(buyer.getByTestId("reach-category-notice")).toHaveCount(0);
  await buyer.context().close();
});

// ── Marketplace search and filters ──────────────────────────────────────────

test("marketplace: a country list, honest sort names, and price compared across currencies", async ({
  browser,
}) => {
  const page = await signIn(browser, NILE_OPS);
  await page.goto("/marketplace", { waitUntil: "domcontentloaded" });
  const country = page.getByLabel("Country of origin");
  await expect(country).toHaveJSProperty("tagName", "SELECT");
  // The list is reference data, cached for five minutes like categories, so it
  // is checked by what it does rather than compared with a live read: choosing
  // one of its countries returns listings from that country.
  const options = (await country
    .locator("option")
    .evaluateAll((els) => els.map((e) => (e as HTMLOptionElement).value))) as string[];
  expect(options[0]).toBe("");
  const chosen = options.find((v) => v !== "");
  if (chosen) {
    const filtered = await json<{ items: Array<{ countryOfOrigin: string }> }>(
      page,
      `/catalogue/search?country=${encodeURIComponent(chosen)}&pageSize=50`,
    );
    for (const l of filtered.items) {
      expect(l.countryOfOrigin.toLowerCase()).toContain(chosen.toLowerCase());
    }
  }
  const sortOptions = await page.getByLabel("Sort by").locator("option").allTextContents();
  expect(sortOptions).toEqual([
    "Featured first",
    "Supplier (A–Z)",
    "Price: low to high",
    "Price: high to low",
  ]);

  // Low to high means low to high once every price is in one currency.
  const rates = await json<Array<{ base: string; quote: string; rate: string | number }>>(
    page,
    "/catalogue/exchange-rates",
  );
  const pairs = rates.map((r) => ({ base: r.base, quote: r.quote, rate: Number(r.rate) }));
  const result = await json<{ items: Array<{ price: string; currency: string }> }>(
    page,
    "/catalogue/search?sort=price_asc&pageSize=50",
  );
  const usd = result.items
    .map((l) => {
      const rate = fxRate(pairs, l.currency, "USD");
      return rate === null ? null : Number(l.price) * rate;
    })
    .filter((v): v is number => v !== null);
  for (let i = 1; i < usd.length; i++) {
    expect(usd[i] as number, `item ${i} is cheaper than item ${i - 1}`).toBeGreaterThanOrEqual(
      (usd[i - 1] as number) - 1e-9,
    );
  }
  await page.context().close();
});

// ── Admin company search ─────────────────────────────────────────────────────

test("admin company search matches type, country and tier, not only the name", async ({
  browser,
}) => {
  const admin = await signIn(browser, SUPER_ADMIN, ADMIN_PASSWORD);
  type Row = { name: string; type: string; country: string; subscriptionTier: string };
  const byType = await json<{ items: Row[] }>(
    admin,
    "/admin/companies?q=Raw%20Material&pageSize=100",
  );
  expect(byType.items.some((c) => c.type === "RAW_MATERIAL_MANUFACTURER")).toBe(true);

  const byCountry = await json<{ items: Row[] }>(admin, "/admin/companies?q=Uganda&pageSize=100");
  expect(byCountry.items.length).toBeGreaterThan(0);
  for (const c of byCountry.items) expect(`${c.name} ${c.country}`).toMatch(/uganda/i);

  const byTier = await json<{ items: Row[] }>(admin, "/admin/companies?q=freemium&pageSize=100");
  expect(byTier.items.some((c) => c.subscriptionTier === "FREEMIUM")).toBe(true);

  await admin.goto("/admin/companies", { waitUntil: "domcontentloaded" });
  await expect(admin.getByPlaceholder("Name, country, type or tier…")).toBeVisible();
  await admin.context().close();
});
