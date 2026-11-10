import { expect, type Page, test } from "@playwright/test";
import {
  API_PATH,
  apiOrigin,
  QUIET_TARGET_SKIP,
  quietRfqTarget,
  signIn,
  topUpCredits,
} from "./helpers";

/**
 * Client review, 2026-11-11 (docs/2026-11-client-review.md).
 *
 *  - US-407 TC3: "attempt to submit a quotation against a CANCELLED RFQ → blocked"
 *    could not be attempted — the RFQ vanished from the supplier's inbox the
 *    moment the buyer cancelled it. It now stays, marked, until its deadline.
 *  - US-604: production had no WhatsApp provider; the account page still said a
 *    code had been sent. An unconfigured channel now says so and refuses.
 *
 * US-603 (message emails per recipient) is covered by
 * apps/api/src/modules/messaging/throttle.test.ts — email delivery is not
 * observable from a browser.
 */
const BUYER = "ops@nilepharma.demo";
const SUPPLIER = "admin@kampalafinechem.demo";
const runId = Date.now().toString(36).toUpperCase();

test.describe
  .serial("US-407 TC3: a cancelled RFQ stays visible to the supplier and cannot be quoted", () => {
    let buyer: Page;
    let supplier: Page;
    let rfq: { id: string; refNo: string };

    test.beforeAll(async ({ browser }) => {
      test.setTimeout(180_000);
      buyer = await signIn(browser, BUYER);
      supplier = await signIn(browser, SUPPLIER);
      const target = await quietRfqTarget(buyer, supplier);
      test.skip(target === null, QUIET_TARGET_SKIP);
      await topUpCredits(browser, [{ email: "admin@nilepharma.demo", kind: "RFQ", count: 1 }]);
      const deadline = new Date(Date.now() + 3 * 864e5);
      const res = await buyer.request.post(`${API_PATH}/rfqs`, {
        data: {
          title: `E2E cancelled RFQ ${runId}`,
          quantity: "10",
          unit: "kg",
          deadline: deadline.toISOString(),
          ...target,
        },
      });
      expect(res.ok(), `raising the RFQ failed: ${await res.text()}`).toBeTruthy();
      rfq = await res.json();
      // Delivery runs just after the response; wait until the supplier has it.
      await expect
        .poll(
          async () => {
            const inbox = await (
              await supplier.request.get(`${API_PATH}/rfqs/inbox?pageSize=100`)
            ).json();
            return (inbox.items as Array<{ id: string }>).some((r) => r.id === rfq.id);
          },
          { timeout: 30_000 },
        )
        .toBe(true);
      const cancelled = await buyer.request.post(`${API_PATH}/rfqs/${rfq.id}/cancel`);
      expect(cancelled.ok(), await cancelled.text()).toBeTruthy();
    });
    test.afterAll(async () => {
      await buyer?.context().close();
      await supplier?.context().close();
    });

    test("the inbox keeps the RFQ, marked cancelled, with no way to quote", async () => {
      const inbox = await (
        await supplier.request.get(`${API_PATH}/rfqs/inbox?pageSize=100`)
      ).json();
      const row = (inbox.items as Array<{ id: string; status: string; cancelledAt: string }>).find(
        (r) => r.id === rfq.id,
      );
      expect(row?.status).toBe("CANCELLED");
      expect(row?.cancelledAt).toBeTruthy();

      await supplier.goto("/quotes", { waitUntil: "networkidle" });
      const tableRow = supplier.getByTestId(`inbox-row-${rfq.refNo}`);
      await expect(tableRow).toBeVisible({ timeout: 20_000 });
      await expect(tableRow).toContainText("Cancelled");
      await expect(tableRow).toContainText("no quotation needed");
      await expect(
        tableRow.getByRole("link", { name: `View cancelled ${rfq.refNo}` }),
      ).toBeVisible();
      await expect(tableRow.getByRole("link", { name: `Quote on ${rfq.refNo}` })).toHaveCount(0);
    });

    test("the RFQ page says the buyer cancelled it and the submit action is blocked", async () => {
      await supplier.goto(`/rfqs/${rfq.id}`, { waitUntil: "networkidle" });
      await expect(supplier.getByText("RFQ sent to you")).toBeVisible();
      await expect(supplier.getByTestId("quote-panel-status")).toContainText(
        "The buyer cancelled this RFQ",
      );
      await expect(supplier.getByRole("button", { name: "Submit quotation" })).toBeDisabled();
    });

    test("submitting anyway is refused with the reason", async () => {
      const res = await supplier.request.post(`${API_PATH}/rfqs/${rfq.id}/quotations`, {
        data: {
          unitPrice: "12.50",
          currency: "USD",
          leadTimeDays: 14,
          validUntil: new Date(Date.now() + 30 * 864e5).toISOString(),
          attachmentDocumentIds: [],
        },
      });
      expect(res.status()).toBe(409);
      expect((await res.json()).error.message).toMatch(/cancelled this RFQ/);
    });
  });

test.describe("US-604: WhatsApp says what it can actually do", () => {
  test("the account and notification pages match the configured channel", async ({
    browser,
    baseURL,
  }) => {
    test.setTimeout(120_000);
    const ready = await (await fetch(`${apiOrigin(baseURL)}/health/ready`)).json();
    const mode = ready.checks?.whatsapp as "off" | "console" | "meta" | undefined;
    expect(mode, "health/ready reports the WhatsApp channel").toBeTruthy();

    const page = await signIn(browser, SUPPLIER);
    await page.goto("/account", { waitUntil: "networkidle" });
    const card = page.getByTestId("whatsapp-card");
    await expect(card).toBeVisible();

    if (mode === "off") {
      await expect(page.getByTestId("whatsapp-unavailable")).toContainText("Not available yet");
      await expect(card.getByLabel("WhatsApp number")).toHaveCount(0);
      const save = await page.request.put(`${API_PATH}/auth/me/whatsapp`, {
        data: { number: "+256700000123" },
      });
      expect(save.status()).toBe(409);
      expect((await save.json()).error.code).toBe("CHANNEL_UNAVAILABLE");

      await page.goto("/notifications", { waitUntil: "networkidle" });
      await expect(page.getByTestId("whatsapp-preference-note")).toContainText("isn't available");
      await expect(page.getByRole("switch", { name: /^WhatsApp for/ })).toHaveCount(0);
    } else {
      await expect(card.getByLabel("WhatsApp number")).toBeVisible();
      if (mode === "console") {
        // Development stand-in only: a real provider would message the number.
        await card.getByLabel("WhatsApp number").fill("+256700000123");
        await card.getByRole("button", { name: "Save number" }).click();
        await expect(card.getByLabel("Verification code")).toBeVisible();
        await expect(page.getByTestId("whatsapp-current")).toContainText("Unverified number");
      }
      const status = await (await page.request.get(`${API_PATH}/auth/me/whatsapp`)).json();
      await page.goto("/notifications", { waitUntil: "networkidle" });
      const switches = page.getByRole("switch", { name: /^WhatsApp for/ });
      await expect(switches.first()).toBeVisible();
      if (!status.verified) {
        // No verified number: shown off and locked, with the way to fix it.
        await expect(switches.first()).toBeDisabled();
        await expect(page.getByTestId("whatsapp-preference-note")).toContainText(
          "needs a verified number",
        );
      }
    }
    await page.context().close();
  });
});
