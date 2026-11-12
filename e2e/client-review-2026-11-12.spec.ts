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
 * Client review, 2026-11-12 (docs/2026-11-client-review.md, "November 12").
 *
 *  - Figure 10: after one stage update the next one failed with "Cannot move
 *    from Goods collected to Goods collected" until a manual reload — the status
 *    dialog kept the stage it was first rendered with. The page also never
 *    updated by itself. Now the dialog takes the stage when it opens, and every
 *    party's page follows the order over a live feed.
 *  - US-701 TC4 (Figure 11): a platform admin saw an order count and nothing
 *    else. /admin/orders lists every order; the order page offers "Correct
 *    status" with a mandatory reason, recorded in the audit log.
 *  - Figures 12–13, "Who completes step 13?": the buyer. Only the party that
 *    may set the next stage gets the button; everyone else reads who will.
 *  - Same day, by message: the WhatsApp Business chat line
 *    (https://wa.me/256784528651) belongs on the public contact surfaces.
 */
const BUYER = "admin@nilepharma.demo";
const SUPPLIER = "admin@kampalafinechem.demo";
const SUPER_ADMIN = "admin@pharmachain.local";
const runId = Date.now().toString(36).toUpperCase();

/** A marker that a full page load would wipe — proves an update arrived in place. */
async function markNoReload(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __e2eSamePage?: boolean }).__e2eSamePage = true;
  });
}
async function stillSamePage(page: Page): Promise<boolean> {
  return page.evaluate(
    () => (window as unknown as { __e2eSamePage?: boolean }).__e2eSamePage === true,
  );
}

test.describe
  .serial("client review 2026-11-12: shipment status, live order page, admin corrections", () => {
    let buyer: Page;
    let supplier: Page;
    let order: { id: string; orderNo: string };

    async function advance(status: string, note?: string) {
      const res = await supplier.request.post(`${API_PATH}/orders/${order.id}/status`, {
        data: { status, note },
      });
      expect(res.ok(), `advancing to ${status}: ${await res.text()}`).toBeTruthy();
    }

    test.beforeAll(async ({ browser }) => {
      test.setTimeout(240_000);
      buyer = await signIn(browser, BUYER);
      supplier = await signIn(browser, SUPPLIER);
      const target = await quietRfqTarget(buyer, supplier);
      test.skip(target === null, QUIET_TARGET_SKIP);
      await topUpCredits(browser, [
        { email: BUYER, kind: "RFQ", count: 1 },
        { email: SUPPLIER, kind: "QUOTATION", count: 1 },
      ]);
      const raised = await buyer.request.post(`${API_PATH}/rfqs`, {
        data: {
          title: `E2E shipment review ${runId}`,
          quantity: "10",
          unit: "kg",
          deadline: new Date(Date.now() + 5 * 864e5).toISOString(),
          ...target,
        },
      });
      expect(raised.ok(), `raising the RFQ: ${await raised.text()}`).toBeTruthy();
      const rfqId = (await raised.json()).id as string;
      const quoted = await supplier.request.post(`${API_PATH}/rfqs/${rfqId}/quotations`, {
        data: {
          unitPrice: "12.50",
          currency: "USD",
          leadTimeDays: 14,
          validUntil: new Date(Date.now() + 30 * 864e5).toISOString(),
          notes: "E2E shipment review quotation",
        },
      });
      expect(quoted.ok(), `quoting: ${await quoted.text()}`).toBeTruthy();
      const accepted = await buyer.request.post(
        `${API_PATH}/quotations/${(await quoted.json()).id}/accept`,
      );
      expect(accepted.ok(), `accepting: ${await accepted.text()}`).toBeTruthy();
      order = await accepted.json();
    });
    test.afterAll(async () => {
      await buyer?.context().close();
      await supplier?.context().close();
    });

    test("Figure 10: two stage updates in a row, no reload in between", async () => {
      test.setTimeout(120_000);
      await supplier.goto(`/orders/${order.id}`);
      await markNoReload(supplier);

      await supplier.getByRole("button", { name: /advance to pickup scheduled/i }).click();
      await supplier.getByLabel("Note", { exact: true }).fill(`Pickup booked (${runId})`);
      await supplier.getByRole("button", { name: /^update status$/i }).click();
      await expect(supplier.getByText(/status updated to pickup scheduled/i)).toBeVisible({
        timeout: 20_000,
      });

      // The reported failure: this second update answered "Cannot move from
      // Pickup scheduled to Pickup scheduled" until the page was reloaded.
      await supplier.getByRole("button", { name: /advance to goods collected/i }).click();
      await expect(supplier.getByLabel("New stage")).toHaveValue(/Goods collected/);
      await supplier.getByRole("button", { name: /^update status$/i }).click();
      await expect(supplier.getByText(/status updated to goods collected/i)).toBeVisible({
        timeout: 20_000,
      });
      await expect(supplier.getByText(/cannot move from/i)).toHaveCount(0);
      await expect(supplier.getByRole("button", { name: /advance to in transit/i })).toBeVisible({
        timeout: 20_000,
      });
      expect(await stillSamePage(supplier)).toBe(true);
    });

    test("the other party's page follows the order without a reload", async () => {
      test.setTimeout(120_000);
      await buyer.goto(`/orders/${order.id}`);
      await expect(buyer.getByText(/Next:\s*4\. In transit/)).toBeVisible({ timeout: 20_000 });
      // The buyer drives nothing until delivery, and is told who does.
      await expect(buyer.getByRole("button", { name: /advance to/i })).toHaveCount(0);
      await expect(buyer.getByText(/set by the supplier or forwarder\./i)).toBeVisible();
      await markNoReload(buyer);

      await advance("IN_TRANSIT", `Departed the warehouse (${runId})`);
      await expect(buyer.getByText(/Next:\s*5\. At port of origin/)).toBeVisible({
        timeout: 30_000,
      });
      await expect(buyer.getByText(`Departed the warehouse (${runId})`)).toBeVisible();
      expect(await stillSamePage(buyer)).toBe(true);
    });

    test("US-701 TC4: the platform admin finds the order and corrects it, with a reason on the audit trail", async ({
      browser,
    }) => {
      test.setTimeout(180_000);
      const admin = await signIn(browser, SUPER_ADMIN, ADMIN_PASSWORD);
      try {
        // Figure 11: the Orders count now leads somewhere.
        await admin.goto("/dashboard");
        await expect(admin.locator('main a[href="/admin/orders"]').first()).toBeVisible({
          timeout: 20_000,
        });

        await admin.goto(`/admin/orders?q=${encodeURIComponent(order.orderNo)}`);
        // A click on a cold page can land mid-hydration and be dropped.
        await admin.waitForLoadState("networkidle");
        await admin.getByRole("link", { name: order.orderNo }).click();
        await expect(admin).toHaveURL(new RegExp(`/orders/${order.id}`), { timeout: 20_000 });
        await admin.waitForLoadState("networkidle");

        // A correction without a reason is refused by the API, not just the form.
        const bare = await admin.request.post(`${API_PATH}/orders/${order.id}/status`, {
          data: { status: "GOODS_COLLECTED" },
        });
        expect(bare.status()).toBe(400);

        await admin.getByRole("button", { name: /correct status/i }).click();
        await admin.getByLabel("Correct to").selectOption({ label: "3. Goods collected" });
        const apply = admin.getByRole("button", { name: /apply correction/i });
        await expect(apply).toBeDisabled();
        const reason = `E2E correction ${runId}: goods still at the warehouse`;
        await admin.getByLabel("Reason for the correction").fill(reason);
        await apply.click();
        await expect(admin.getByText(/status corrected to goods collected/i)).toBeVisible({
          timeout: 20_000,
        });

        await admin.getByRole("link", { name: /audit trail/i }).click();
        await expect(admin).toHaveURL(/\/admin\/audit\?.*entityId=/);
        await expect(admin.getByText("order.status-correct").first()).toBeVisible({
          timeout: 20_000,
        });
        await expect(admin.getByText(`reason: ${reason}`)).toBeVisible();
      } finally {
        await admin.context().close();
      }
    });

    test("Figures 12–13: the buyer completes stage 13; the supplier is told so and cannot", async () => {
      test.setTimeout(180_000);
      for (const status of [
        "IN_TRANSIT",
        "AT_PORT_OF_ORIGIN",
        "CUSTOMS_ORIGIN",
        "DEPARTED",
        "AT_PORT_OF_DESTINATION",
        "CUSTOMS_DESTINATION",
        "INLAND_TRANSPORT",
        "OUT_FOR_DELIVERY",
        "DELIVERED",
      ]) {
        await advance(status);
      }

      await supplier.goto(`/orders/${order.id}`);
      await expect(supplier.getByText(/Next:\s*13\. Delivery confirmed/)).toBeVisible({
        timeout: 20_000,
      });
      await expect(supplier.getByText(/set by the buyer/i).first()).toBeVisible();
      await expect(
        supplier.getByRole("button", { name: /advance to|confirm delivery/i }),
      ).toHaveCount(0);
      const refused = await supplier.request.post(`${API_PATH}/orders/${order.id}/status`, {
        data: { status: "DELIVERY_CONFIRMED" },
      });
      expect(refused.status()).toBe(403);
      await markNoReload(supplier);

      await buyer.goto(`/orders/${order.id}`);
      await buyer.getByRole("button", { name: /confirm delivery/i }).click();
      await expect(buyer.getByRole("dialog").getByText(/stage 13 of 13/i)).toBeVisible();
      await buyer.getByLabel("Note", { exact: true }).fill(`Received in full (${runId})`);
      await buyer
        .getByRole("dialog")
        .getByRole("button", { name: /confirm delivery/i })
        .click();
      await expect(buyer.getByText(/delivery confirmed — the order is complete/i)).toBeVisible({
        timeout: 20_000,
      });
      await expect(buyer.getByText(/Completed — delivery confirmed by/i)).toBeVisible({
        timeout: 20_000,
      });

      // …and the supplier's open page catches up by itself.
      await expect(supplier.getByText(/Completed — delivery confirmed by/i)).toBeVisible({
        timeout: 30_000,
      });
      expect(await stillSamePage(supplier)).toBe(true);
    });
  });

test("the WhatsApp Business chat line is on the public contact surfaces", async ({ page }) => {
  // Set by NEXT_PUBLIC_WHATSAPP_NUMBER at build time; the default is the
  // client's number, so a deployment that overrides it may skip this.
  const href = "https://wa.me/256784528651";
  for (const path of ["/", "/disclaimer"]) {
    await page.goto(path);
    const link = page.locator(`a[href="${href}"]`).first();
    await expect(link, `${path} has no WhatsApp link`).toBeVisible({ timeout: 20_000 });
    await expect(link).toHaveAttribute(
      "aria-label",
      /Message Pharmachain Global Enterprises on WhatsApp/,
    );
  }
});
