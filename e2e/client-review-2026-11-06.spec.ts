import { expect, type Page, test } from "@playwright/test";
import { signIn } from "./helpers";

/**
 * Client review, 2026-11-06 (docs/2026-11-client-review.md, "November 6").
 *
 * "When a user filters, they have to click the 'Search' button to get the
 * filtered results, yet the 'Search' button looks to be for the search field …
 * Better would be if the results from the filter come, even without pressing
 * the button." The marketplace now applies every filter as it changes and the
 * search box as you type; there is no button.
 */
const BUYER = "ops@nilepharma.demo";

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

test("marketplace filters and search apply without a button (Nov 6)", async ({ browser }) => {
  test.setTimeout(120_000);
  const page = await signIn(browser, BUYER);
  await page.goto("/marketplace");
  // A cold page: let it hydrate before changing anything.
  await page.waitForLoadState("networkidle");
  const panel = page.getByRole("search", { name: "Search the marketplace" });
  await expect(panel).toBeVisible();

  // The ambiguous button is gone, and the panel says how it behaves.
  await expect(panel.getByRole("button", { name: /^search/i })).toHaveCount(0);
  await expect(panel.getByText(/update as you type or change a filter/i)).toBeVisible();
  await markNoReload(page);

  // A filter applies on its own.
  await panel.getByLabel("Listing type").selectOption("RAW_MATERIAL");
  await expect(page).toHaveURL(/[?&]kind=RAW_MATERIAL/, { timeout: 20_000 });
  await expect(page.getByRole("link", { name: /remove filter raw material/i })).toBeVisible({
    timeout: 20_000,
  });

  // Another filter keeps the first one.
  await panel.getByLabel("Sort by").selectOption("price_asc");
  await expect(page).toHaveURL(/[?&]sort=price_asc/, { timeout: 20_000 });
  await expect(page).toHaveURL(/[?&]kind=RAW_MATERIAL/);

  // The search box follows what is typed, keeping the filters.
  await panel.getByRole("searchbox", { name: "Search products" }).fill("para");
  await expect(page).toHaveURL(/[?&]q=para/, { timeout: 20_000 });
  await expect(page).toHaveURL(/[?&]kind=RAW_MATERIAL/);
  await expect(page.getByRole("link", { name: /remove filter "para"/i })).toBeVisible({
    timeout: 20_000,
  });

  // Removing a chip resets its control to match what the results are filtered by.
  await page.getByRole("link", { name: /remove filter raw material/i }).click();
  await expect(page).not.toHaveURL(/[?&]kind=/, { timeout: 20_000 });
  await expect(panel.getByLabel("Listing type")).toHaveValue("");

  // All of it happened in place — no full page load.
  expect(await stillSamePage(page)).toBe(true);
  await page.context().close();
});
