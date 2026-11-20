import { expect, test } from "@playwright/test";
import {
  ADMIN_PASSWORD,
  API_PATH,
  QUIET_TARGET_SKIP,
  quietRfqTarget,
  signIn,
  topUpCredits,
} from "./helpers";

/**
 * ADR-0007 (docs/adr/ADR-0007-published-aggregates-and-rival-appointees.md):
 * published price and deal figures come only from settled records over closed
 * periods; quote state changes are atomic; a delivered order takes no new
 * logistics partner; the landing makes only claims the API enforces.
 *
 * Not covered here (needs logistics companies with verified documents, which
 * the seed does not have): refusing to appoint a losing bidder. That is shown
 * on a local fixture in the ADR's Confirmation section.
 */
const SUPER_ADMIN = "admin@pharmachain.local";
const BUYER = "ops@nilepharma.demo";
const SUPPLIER = "ops@kampalafinechem.demo";

const monthKey = (d: Date) => d.toISOString().slice(0, 7);

test("intelligence publishes closed periods only and says which quotes count", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const admin = await signIn(browser, SUPER_ADMIN, ADMIN_PASSWORD);

  const prices = await (await admin.request.get(`${API_PATH}/intelligence/prices`)).json();
  expect(prices.months, "twelve months").toHaveLength(12);
  expect(prices.months, "the month in progress is never published").not.toContain(
    monthKey(new Date()),
  );

  const res = await admin.request.get(`${API_PATH}/intelligence/market-report`);
  expect(res.status()).toBe(200);
  const report = await res.json();
  expect(report.period.label, "a whole calendar quarter").toMatch(/^\d{4}-Q[1-4]$/);
  expect(new Date(report.period.to).getTime()).toBeLessThanOrEqual(Date.now());
  for (const row of report.categories) {
    expect(row.demandVolume90d, `${row.category}: demand volume is withheld`).toBeNull();
    expect(typeof row.pricedQuoteCount).toBe("number");
    if (row.avgQuotedUnitPrice !== null) {
      expect(row.currency, `${row.category}: a price names its currency`).toBeTruthy();
    }
  }
  const csv = await (
    await admin.request.get(`${API_PATH}/intelligence/market-report?format=csv`)
  ).text();
  expect(csv.split("\n")[0]).toBe("Category,RFQs,Avg quoted price,Priced from,Quotes");

  const buyer = await signIn(browser, BUYER);
  await buyer.goto("/intelligence");
  await expect(
    buyer
      .getByText(/Only quotations that did not win count|A month is shown once every RFQ/)
      .first(),
  ).toBeVisible();
  await admin.context().close();
  await buyer.context().close();
});

test("a quote is revised, withdrawn and revised again while open; never after the award", async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const buyer = await signIn(browser, BUYER);
  const supplier = await signIn(browser, SUPPLIER);
  const target = await quietRfqTarget(buyer, supplier);
  test.skip(target === null, QUIET_TARGET_SKIP);
  await topUpCredits(browser, [
    { email: "admin@nilepharma.demo", kind: "RFQ", count: 1 },
    { email: "admin@kampalafinechem.demo", kind: "QUOTATION", count: 3 },
  ]);

  const raised = await buyer.request.post(`${API_PATH}/rfqs`, {
    data: {
      title: `e2e quote lifecycle ${Date.now()}`,
      quantity: "10",
      unit: "kg",
      deadline: new Date(Date.now() + 7 * 864e5).toISOString(),
      ...target,
    },
  });
  expect(raised.ok(), await raised.text()).toBeTruthy();
  const rfq = await raised.json();
  const quote = (unitPrice: string) => ({
    data: {
      unitPrice,
      currency: "USD",
      leadTimeDays: 10,
      validUntil: new Date(Date.now() + 20 * 864e5).toISOString(),
    },
  });

  const v1 = await supplier.request.post(`${API_PATH}/rfqs/${rfq.id}/quotations`, quote("10.00"));
  expect(v1.status(), await v1.text()).toBe(201);
  const v2 = await supplier.request.post(
    `${API_PATH}/quotations/${(await v1.json()).id}/resubmit`,
    quote("9.50"),
  );
  expect(v2.status(), await v2.text()).toBe(201);
  const second = await v2.json();
  expect(second.version).toBe(2);

  const withdrawn = await supplier.request.post(`${API_PATH}/quotations/${second.id}/withdraw`);
  expect(withdrawn.ok(), await withdrawn.text()).toBeTruthy();

  // The page offers a new version rather than a fresh submission the API would refuse.
  await supplier.goto(`/rfqs/${rfq.id}`);
  await expect(supplier.getByRole("button", { name: "Submit a new version" })).toBeVisible();

  const v3 = await supplier.request.post(
    `${API_PATH}/quotations/${second.id}/resubmit`,
    quote("9.20"),
  );
  expect(v3.status(), `a withdrawn quote can be replaced while open: ${await v3.text()}`).toBe(201);
  const third = await v3.json();
  expect(third.version).toBe(3);

  const award = await buyer.request.post(`${API_PATH}/quotations/${third.id}/accept`);
  expect(award.status(), await award.text()).toBe(201);
  const late = await supplier.request.post(
    `${API_PATH}/quotations/${third.id}/resubmit`,
    quote("8.00"),
  );
  expect(late.status(), "no revision once awarded").toBe(409);
  const pull = await supplier.request.post(`${API_PATH}/quotations/${third.id}/withdraw`);
  expect(pull.status(), "an accepted quote cannot be withdrawn").toBe(409);
  await buyer.context().close();
  await supplier.context().close();
});

test("a delivered order takes no new logistics partner, and the page does not offer one", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const buyer = await signIn(browser, BUYER);
  const list = await (await buyer.request.get(`${API_PATH}/orders?role=buyer&pageSize=100`)).json();
  const delivered = (list.items as Array<{ id: string; status: string }>).find(
    (o) => o.status === "DELIVERY_CONFIRMED",
  );
  test.skip(!delivered, "the demo buyer has no delivery-confirmed order on this stack");
  const orderId = (delivered as { id: string }).id;

  const res = await buyer.request.post(`${API_PATH}/orders/${orderId}/appointments`, {
    data: { role: "FORWARDER", companyId: "00000000-0000-7000-8000-000000000000" },
  });
  expect(res.status()).toBe(409);
  expect(await res.text()).toContain("confirmed delivered");

  await buyer.goto(`/orders/${orderId}`);
  await expect(buyer.getByText("Logistics partners")).toBeVisible();
  await expect(buyer.getByRole("button", { name: /Appoint partner/ })).toHaveCount(0);
  await buyer.context().close();
});

test("the landing makes only claims the API enforces", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(
    page.getByText("Competing suppliers never see each other's quotations or threads."),
  ).toBeVisible();
  await expect(page.getByText(/Zero data leakage/)).toHaveCount(0);
  // The hero's illustrative figures say so.
  await expect(page.getByText("Example · marketplace median, 30 days")).toBeAttached();
  await expect(page.getByText("Example · on-time deliveries, 30 days")).toBeAttached();
  const faq = page.locator("details", { hasText: "Who can see my quotations and messages?" });
  await faq.locator("summary").click();
  await expect(faq).toContainText("The platform team can also see orders");
});
