import { type APIResponse, expect, type Page, test } from "@playwright/test";
import { API_PATH, QUIET_TARGET_SKIP, quietRfqTarget, signIn, topUpCredits } from "./helpers";

/**
 * Client review, 2026-11-25 (docs/2026-11-client-review.md, "November 25").
 *
 * Fig 16-19: "When the user (operations staff) raises an RFQ via the BOM line,
 * the quantity is not pre-filled in the RFQ form and when they change it, that
 * change does not reflect when they go back to the BOM listing/details."
 * Question: "What happens if a user deletes one of the items for which they had
 * raised an RFQ, and activates the new BOM version? Is the last RFQ based on the
 * previous BOM closed?"
 *
 * Each test builds its own draft finished product, so it never touches a
 * product anyone else uses, and cancels the RFQs it raised.
 */
const BUYER_OPS = "ops@nilepharma.demo";
const SUPPLIER_OPS = "ops@kampalafinechem.demo";

async function ok(res: APIResponse, what: string) {
  expect(res.ok(), `${what}: ${res.status()} ${await res.text()}`).toBeTruthy();
  return res.json();
}

/** A draft finished product with an ACTIVE version 1 BOM of the given lines. */
async function productWithBom(
  page: Page,
  categoryId: string,
  lines: Array<{ materialName: string; quantityPerUnit: string; unit: string }>,
) {
  const tag = Date.now().toString(36).toUpperCase();
  const product = await ok(
    await page.request.post(`${API_PATH}/catalogue`, {
      data: {
        kind: "FINISHED_PRODUCT",
        name: `QA BOM product ${tag}`,
        countryOfOrigin: "Uganda",
        packagingType: "Blister",
        packSize: "10 x 10",
        unit: "box",
        categoryId,
        price: "1",
        currency: "USD",
      },
    }),
    "create draft product",
  );
  const bom = await ok(
    await page.request.post(`${API_PATH}/boms`, {
      data: {
        productListingId: product.id,
        items: lines.map((l) => ({ ...l, materialName: `${l.materialName} ${tag}`, categoryId })),
      },
    }),
    "create BOM",
  );
  await ok(await page.request.post(`${API_PATH}/boms/${bom.id}/activate`), "activate v1");
  return { productId: product.id as string, bom, tag };
}

async function raiseRfq(page: Page, bomItem: { id: string; materialName: string }, target: object) {
  return ok(
    await page.request.post(`${API_PATH}/rfqs`, {
      data: {
        title: bomItem.materialName,
        quantity: "5",
        unit: "kg",
        deadline: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
        bomItemId: bomItem.id,
        ...target,
      },
    }),
    `raise RFQ for ${bomItem.materialName}`,
  );
}

test("Raise RFQ from a BOM line pre-fills the quantity, and the BOM shows what was requested (Fig 16-18)", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const buyer = await signIn(browser, BUYER_OPS);
  const supplier = await signIn(browser, SUPPLIER_OPS);
  const target = await quietRfqTarget(buyer, supplier);
  await supplier.context().close();
  test.skip(!target, QUIET_TARGET_SKIP);
  await topUpCredits(browser, [{ email: "admin@nilepharma.demo", kind: "RFQ", count: 1 }]);
  const categories = await ok(await buyer.request.get(`${API_PATH}/catalogue/categories`), "cats");
  const categoryId = target?.categoryId ?? categories[0].id;
  const { productId, tag } = await productWithBom(buyer, categoryId, [
    { materialName: "Item 2", quantityPerUnit: "20", unit: "kg" },
  ]);
  const material = `Item 2 ${tag}`;

  await buyer.goto(`/catalogue/${productId}/bom`);
  await buyer.waitForLoadState("networkidle");
  const line = buyer.getByRole("row", { name: new RegExp(material) });
  await line.getByRole("link", { name: "Raise RFQ" }).click();
  await expect(buyer).toHaveURL(/\/rfqs\/new\?/, { timeout: 20_000 });
  await buyer.waitForLoadState("networkidle");

  const quantity = buyer.getByLabel("Quantity", { exact: true });
  await expect(quantity, "quantity pre-filled from the BOM line").toHaveValue("20");
  await expect(buyer.getByLabel("Unit", { exact: true })).toHaveValue("kg");

  await quantity.fill("100");
  await buyer.getByRole("button", { name: "Publish RFQ" }).click();
  await expect(buyer).toHaveURL(/\/rfqs\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  await expect(buyer.getByRole("main")).toContainText(/Quantity:\s*100 kg/);
  const rfqId = buyer.url().split("/").pop() as string;

  await buyer.goto(`/catalogue/${productId}/bom`);
  await buyer.waitForLoadState("networkidle");
  const after = buyer.getByRole("row", { name: new RegExp(material) });
  await expect(after, "the recipe keeps its own quantity per unit").toContainText("20 kg");
  await expect(after, "the RFQ's adjusted quantity shows on the line").toContainText(
    /RFQ in progress.*100 kg requested/,
  );

  await ok(await buyer.request.post(`${API_PATH}/rfqs/${rfqId}/cancel`), "cancel test RFQ");
  await buyer.context().close();
});

test("a new BOM version keeps its lines' RFQs and warns before dropping a line with an open RFQ (Nov 25 question)", async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const buyer = await signIn(browser, BUYER_OPS);
  const supplier = await signIn(browser, SUPPLIER_OPS);
  const target = await quietRfqTarget(buyer, supplier);
  await supplier.context().close();
  test.skip(!target, QUIET_TARGET_SKIP);
  await topUpCredits(browser, [{ email: "admin@nilepharma.demo", kind: "RFQ", count: 2 }]);
  const categories = await ok(await buyer.request.get(`${API_PATH}/catalogue/categories`), "cats");
  const categoryId = target?.categoryId ?? categories[0].id;
  const { productId, bom, tag } = await productWithBom(buyer, categoryId, [
    { materialName: "Item 1", quantityPerUnit: "1000", unit: "g" },
    { materialName: "Item 2", quantityPerUnit: "20", unit: "kg" },
  ]);
  const [kept, dropped] = bom.items as Array<{ id: string; materialName: string }>;
  const keptRfq = await raiseRfq(buyer, kept, target ?? {});
  const droppedRfq = await raiseRfq(buyer, dropped, target ?? {});

  // Version 2 deletes Item 2 and keeps Item 1, through the edit form.
  await buyer.goto(`/catalogue/${productId}/bom`);
  await buyer.waitForLoadState("networkidle");
  await buyer.getByRole("button", { name: "Edit (creates new version)" }).click();
  await buyer.getByRole("button", { name: "Remove line" }).nth(1).click();
  await buyer.getByRole("button", { name: "Save version" }).click();
  const v2 = buyer.locator("[data-slot=card]", { hasText: "Version 2" });
  await expect(v2).toBeVisible({ timeout: 20_000 });

  await expect(
    v2.getByRole("row", { name: new RegExp(`Item 1 ${tag}`) }),
    "the kept line still shows its RFQ instead of offering a second one",
  ).toContainText(`RFQ in progress · ${keptRfq.refNo}`);

  await v2.getByRole("button", { name: "Activate" }).click();
  const dialog = buyer.getByRole("dialog");
  await expect(dialog, "activation names the RFQ the new version leaves behind").toContainText(
    droppedRfq.refNo,
  );
  await expect(dialog).toContainText(`Item 2 ${tag}`);
  await expect(dialog).not.toContainText(keptRfq.refNo);
  await dialog.getByRole("button", { name: "Activate version 2" }).click();
  await expect(v2).toContainText("Active", { timeout: 20_000 });

  const still = await ok(await buyer.request.get(`${API_PATH}/rfqs/${droppedRfq.id}`), "RFQ");
  expect(still.status, "activation does not cancel the RFQ for the deleted line").toBe("OPEN");

  for (const rfq of [keptRfq, droppedRfq]) {
    await ok(await buyer.request.post(`${API_PATH}/rfqs/${rfq.id}/cancel`), "cancel test RFQ");
  }
  await buyer.context().close();
});
