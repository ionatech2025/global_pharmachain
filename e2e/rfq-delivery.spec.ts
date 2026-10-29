import { expect, type Page, test } from "@playwright/test";
import { API_PATH, QUIET_TARGET_SKIP, quietRfqTarget, signIn, topUpCredits } from "./helpers";

/**
 * RFQ delivery (2026-10-29 audit). Before it, a new RFQ reached no supplier
 * until they happened to open their inbox; pages never updated by themselves;
 * the deadline was a date with no time; there was no receipt, no amendment and
 * no record of who an RFQ went to. UNCITRAL Model Law arts. 28(2), 30(1),
 * 30(4) and 30(5)(c) are what each case below holds the product to.
 *
 * Serial: one RFQ walks through publication, a quotation and an amendment, and
 * a second is cancelled — two RFQs per run against the buyer's monthly allowance.
 */
const BUYER = "ops@nilepharma.demo";
const SUPPLIER = "admin@kampalafinechem.demo";
const runId = Date.now().toString(36).toUpperCase();

async function json<T = Record<string, unknown>>(page: Page, path: string): Promise<T> {
  const res = await page.request.get(`${API_PATH}${path}`);
  expect(res.ok(), `${path} → ${res.status()}`).toBeTruthy();
  return res.json() as Promise<T>;
}

/** The newest notifications of the signed-in user whose title matches. */
async function notificationsMatching(page: Page, pattern: RegExp) {
  const list = await json<{ items: Array<{ title: string; body: string; href: string | null }> }>(
    page,
    "/notifications?page=1&pageSize=30",
  );
  return list.items.filter((n) => pattern.test(n.title));
}

async function raiseRfq(
  buyer: Page,
  target: { targetCompanyType: string; categoryId?: string },
  title: string,
) {
  const deadline = new Date(Date.now() + 3 * 864e5);
  deadline.setUTCHours(14, 30, 0, 0); // a time of day that is not the old 23:59 UTC
  const res = await buyer.request.post(`${API_PATH}/rfqs`, {
    data: { title, quantity: "25", unit: "kg", deadline: deadline.toISOString(), ...target },
  });
  expect(
    res.ok(),
    `raising the RFQ failed (HTTP ${res.status()}): ${await res.text()}`,
  ).toBeTruthy();
  return { ...(await res.json()), deadline } as { id: string; refNo: string; deadline: Date };
}

test.describe
  .serial("RFQ delivery: published, delivered, live, amended, cancelled", () => {
    let buyer: Page;
    let supplier: Page;
    let target: { targetCompanyType: string; categoryId?: string };
    let rfq: { id: string; refNo: string; deadline: Date };

    test.beforeAll(async ({ browser }) => {
      test.setTimeout(180_000); // four sign-ins; a deployed target takes ~10 s each from here
      buyer = await signIn(browser, BUYER);
      supplier = await signIn(browser, SUPPLIER);
      // Every RFQ raised here is delivered; aim it where only the demo supplier is.
      const quiet = await quietRfqTarget(buyer, supplier);
      test.skip(quiet === null, QUIET_TARGET_SKIP);
      target = quiet as typeof target;
      // Two RFQs and one quotation per run, against the demo companies' allowance.
      await topUpCredits(browser, [
        { email: "admin@nilepharma.demo", kind: "RFQ", count: 2 },
        { email: SUPPLIER, kind: "QUOTATION", count: 1 },
      ]);
    });
    test.afterAll(async () => {
      await buyer?.context().close();
      await supplier?.context().close();
    });

    test("a new RFQ appears in the supplier's open inbox without a reload, and they are notified", async () => {
      test.setTimeout(90_000);
      await supplier.goto("/quotes", { waitUntil: "networkidle" });
      rfq = await raiseRfq(buyer, target, `E2E delivery ${runId}`);

      // The inbox the supplier already has open picks it up by itself (SSE).
      await expect(supplier.getByRole("link", { name: rfq.refNo })).toBeVisible({
        timeout: 30_000,
      });

      // And the notice reached them, with the deadline as a date, a time and a zone.
      await expect
        .poll(async () => (await notificationsMatching(supplier, new RegExp(rfq.refNo))).length, {
          timeout: 30_000,
        })
        .toBeGreaterThan(0);
      const [notice] = await notificationsMatching(supplier, new RegExp(`New RFQ ${rfq.refNo}`));
      expect(notice?.body).toMatch(/Quotations close .+\d{2}:\d{2}.+\(\d{2}:\d{2} UTC\)/);
      expect(notice?.href).toBe(`/rfqs/${rfq.id}`);
    });

    test("the RFQ page states the deadline with its time, not just a date", async () => {
      await supplier.goto(`/rfqs/${rfq.id}`, { waitUntil: "domcontentloaded" });
      await expect(supplier.getByTestId("rfq-deadline")).toHaveText(/\d{1,2}:\d{2}/);
    });

    test("a quotation shows up on the buyer's open RFQ page live, and the supplier gets a timed receipt", async () => {
      test.setTimeout(90_000);
      await buyer.goto(`/rfqs/${rfq.id}`, { waitUntil: "networkidle" });
      const quoted = await supplier.request.post(`${API_PATH}/rfqs/${rfq.id}/quotations`, {
        data: {
          unitPrice: "11.20",
          currency: "USD",
          leadTimeDays: 10,
          validUntil: new Date(Date.now() + 30 * 864e5).toISOString(),
          notes: `e2e delivery ${runId}`,
        },
      });
      expect(quoted.ok(), await quoted.text()).toBeTruthy();
      const quotation = (await quoted.json()) as { refNo: string };

      const supplierName = (
        await json<{ membership: { companyName: string } }>(supplier, "/auth/me")
      ).membership.companyName;
      await expect(buyer.getByRole("row", { name: new RegExp(supplierName) })).toBeVisible({
        timeout: 30_000,
      });

      // UNCITRAL art. 30(5)(c): the date and time it was received, on request — here, always.
      const [receipt] = await notificationsMatching(
        supplier,
        new RegExp(`Quotation ${quotation.refNo} received`),
      );
      expect(receipt?.body).toMatch(/was received .+\d{2}:\d{2}/);
      expect(receipt?.body).toContain("You can replace it until");
    });

    test("a deadline can be extended, never brought forward, and the amendment reaches the supplier", async () => {
      test.setTimeout(90_000);
      const earlier = await buyer.request.post(`${API_PATH}/rfqs/${rfq.id}/amend`, {
        data: {
          note: "Trying to shorten the window — must be refused.",
          newDeadline: new Date(rfq.deadline.getTime() - 864e5).toISOString(),
        },
      });
      expect(earlier.status()).toBe(400);

      const later = new Date(rfq.deadline.getTime() + 2 * 864e5);
      const amended = await buyer.request.post(`${API_PATH}/rfqs/${rfq.id}/amend`, {
        data: { note: `Delivery is now CIF Entebbe (${runId}).`, newDeadline: later.toISOString() },
      });
      expect(amended.ok(), await amended.text()).toBeTruthy();
      // Delivered to the demo supplier and nobody else (see quietRfqTarget).
      const { recipients } = await amended.json();
      expect(recipients).toBeGreaterThan(0);
      if (target.categoryId) expect(recipients).toBe(1);

      await expect
        .poll(
          async () =>
            (await notificationsMatching(supplier, /RFQ amended, deadline extended/)).length,
          {
            timeout: 30_000,
          },
        )
        .toBeGreaterThan(0);
      await supplier.goto(`/rfqs/${rfq.id}`, { waitUntil: "domcontentloaded" });
      await expect(supplier.getByTestId("rfq-amendments")).toContainText(`CIF Entebbe (${runId})`);
      const detail = await json<{ deadline: string }>(supplier, `/rfqs/${rfq.id}`);
      expect(new Date(detail.deadline).getTime()).toBe(later.getTime());
    });

    test("a cancellation reaches a supplier that had not quoted (it was sent the RFQ)", async () => {
      test.setTimeout(90_000);
      const second = await raiseRfq(buyer, target, `E2E delivery cancel ${runId}`);
      await expect
        .poll(
          async () => (await notificationsMatching(supplier, new RegExp(second.refNo))).length,
          {
            timeout: 30_000,
          },
        )
        .toBeGreaterThan(0);
      const cancelled = await buyer.request.post(`${API_PATH}/rfqs/${second.id}/cancel`);
      expect(cancelled.ok(), await cancelled.text()).toBeTruthy();
      await expect
        .poll(
          async () =>
            (await notificationsMatching(supplier, /RFQ cancelled/)).some((n) =>
              n.body.includes(second.refNo),
            ),
          { timeout: 30_000 },
        )
        .toBe(true);
      // Cancelling twice is refused, not repeated.
      const again = await buyer.request.post(`${API_PATH}/rfqs/${second.id}/cancel`);
      expect(again.status()).toBe(409);
    });
  });
