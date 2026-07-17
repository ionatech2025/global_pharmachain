import { type Browser, expect, type Page, test } from "@playwright/test";

/**
 * Phase 1 golden path against the seeded demo stack (see e2e/README.md):
 * buyer raises an RFQ → supplier quotes from the inbox → buyer accepts and an
 * order is created → seller advances shipment → buyer sees the new stage.
 *
 * Each persona gets its own browser context (isolated cookies), which mirrors
 * reality and avoids sign-out choreography.
 */
const BUYER_EMAIL = "ops@nilepharma.demo";
const SELLER_EMAIL = "ops@kampalafinechem.demo";
const PASSWORD = process.env.SEED_DEMO_PASSWORD ?? "demo-Pass-1";

const RUN_TAG = `E2E-${Date.now().toString(36).toUpperCase()}`;
const RFQ_TITLE = `Ibuprofen BP (API) — 250 kg ${RUN_TAG}`;

async function signIn(browser: Browser, email: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
  return page;
}

test.describe
  .serial("Phase 1 golden path", () => {
    let rfqUrl: string;
    let orderUrl: string;

    test("buyer signs in and raises an RFQ", async ({ browser }) => {
      const page = await signIn(browser, BUYER_EMAIL);

      await page.goto("/rfqs/new");
      await page.getByLabel("Product / material required").fill(RFQ_TITLE);
      await page.getByLabel("Quantity").fill("250");
      await page.getByLabel("Unit").fill("kg");
      const deadline = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      await page.getByLabel("Response deadline").fill(deadline);
      await page.getByRole("button", { name: /publish rfq/i }).click();

      await expect(page).toHaveURL(/\/rfqs\/[0-9a-f-]{36}/, { timeout: 20_000 });
      await expect(page.getByText(RFQ_TITLE).first()).toBeVisible();
      rfqUrl = new URL(page.url()).pathname;
      await page.context().close();
    });

    test("supplier finds the RFQ in the quote inbox and quotes", async ({ browser }) => {
      const page = await signIn(browser, SELLER_EMAIL);

      await page.goto("/quotes");
      const row = page.getByRole("row", { name: new RegExp(RUN_TAG) });
      await expect(row).toBeVisible();
      await row.getByRole("link").first().click();

      await expect(page.getByText(/submit a quotation/i)).toBeVisible();
      await page.getByLabel(/unit price/i).fill("13.75");
      await page.getByRole("button", { name: /submit quotation/i }).click();
      await expect(page.getByText(/your quotation \(v1\)/i)).toBeVisible({ timeout: 20_000 });
      await page.context().close();
    });

    test("buyer accepts the quotation and an order is created", async ({ browser }) => {
      const page = await signIn(browser, BUYER_EMAIL);

      await page.goto(rfqUrl);
      await page.getByRole("button", { name: "Accept", exact: true }).click();
      await page.getByRole("button", { name: /accept & create order/i }).click();

      await expect(page).toHaveURL(/\/orders\/[0-9a-f-]{36}/, { timeout: 20_000 });
      await expect(page.getByText(/order confirmed/i).first()).toBeVisible();
      orderUrl = new URL(page.url()).pathname;
      await page.context().close();
    });

    test("seller advances the shipment one stage", async ({ browser }) => {
      const page = await signIn(browser, SELLER_EMAIL);

      await page.goto(orderUrl);
      await page.getByRole("button", { name: /advance to pickup scheduled/i }).click();
      await page.getByLabel("Note").fill("Pickup booked with forwarder (e2e)");
      await page.getByRole("button", { name: /update status/i }).click();
      await expect(page.getByText(/status updated to pickup scheduled/i)).toBeVisible({
        timeout: 20_000,
      });
      await page.context().close();
    });

    test("buyer sees the new shipment stage and history", async ({ browser }) => {
      const page = await signIn(browser, BUYER_EMAIL);

      await page.goto(orderUrl);
      await expect(page.getByText(/pickup scheduled/i).first()).toBeVisible();
      await expect(page.getByText(/pickup booked with forwarder \(e2e\)/i)).toBeVisible();
      await page.context().close();
    });
  });
