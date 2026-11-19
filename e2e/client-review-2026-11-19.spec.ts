import { expect, test } from "@playwright/test";
import { ADMIN_PASSWORD, signIn } from "./helpers";

/**
 * Client review, 2026-11-19 (docs/2026-11-client-review.md, "November 19").
 *
 * Fig 14: "The admin can filter audit logs, but has no way of clearing the
 * current filters, except till when they move off the audit logs page, and
 * come back."
 * Fig 15: "There's an inconsistent behavior when typing out the name/text of
 * something when searching" (admin Companies search).
 */
const SUPER_ADMIN = "admin@pharmachain.local";

test("audit logs: Clear filters resets every filter in place (Fig 14)", async ({ browser }) => {
  test.setTimeout(120_000);
  const page = await signIn(browser, SUPER_ADMIN, ADMIN_PASSWORD);
  await page.goto("/admin/audit");
  await page.waitForLoadState("networkidle");

  // Nothing to clear yet.
  await expect(page.getByRole("link", { name: "Clear filters" })).toHaveCount(0);

  await page.getByLabel("Actor email").fill(SUPER_ADMIN);
  await page.getByLabel("Entity type").fill("Company");
  await page.getByLabel("From date").fill("2026-11-18");
  await page.getByLabel("To date").fill("2026-11-19");
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page).toHaveURL(/[?&]actorEmail=/, { timeout: 20_000 });

  const clear = page.getByRole("link", { name: "Clear filters" });
  await expect(clear, "a way to clear the applied filters").toBeVisible();
  // An edit typed but not yet applied is cleared too.
  await page.getByLabel("Actor email").fill("someone-else@example.com");
  await clear.click();
  await expect(page).toHaveURL(/\/admin\/audit$/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Audit logs" })).toBeVisible();
  for (const label of ["Actor email", "Entity type", "From date", "To date"]) {
    await expect(page.getByLabel(label), `${label} emptied`).toHaveValue("");
  }
  await expect(page.getByRole("link", { name: "Clear filters" })).toHaveCount(0);

  // A record's trail (entityId, linked from an order) has no visible field, so
  // Clear is the only way out of it.
  await page.goto("/admin/audit?entityType=Order&entityId=00000000-0000-0000-0000-000000000000");
  await page.waitForLoadState("networkidle");
  await page.getByRole("link", { name: "Clear filters" }).click();
  await expect(page).toHaveURL(/\/admin\/audit$/, { timeout: 20_000 });
  await expect(page.getByLabel("Entity type")).toHaveValue("");
  await page.context().close();
});

test("companies search keeps what is typed while results load (Fig 15)", async ({ browser }) => {
  test.setTimeout(120_000);
  const page = await signIn(browser, SUPER_ADMIN, ADMIN_PASSWORD);

  // Hold each search's results until released, to type while they are in
  // flight the way a slow connection does.
  const held: Array<() => Promise<void>> = [];
  await page.route("**/admin/companies?**", async (route) => {
    const req = route.request();
    const isSearch =
      req.headers().rsc === "1" &&
      !req.headers()["next-router-prefetch"] &&
      new URL(req.url()).searchParams.has("q");
    if (!isSearch) return route.continue();
    const response = await route.fetch();
    held.push(() => route.fulfill({ response }));
  });

  // The search box waits for a pause in typing; the test decides when one ends.
  await page.clock.install();
  await page.goto("/admin/companies");
  await page.waitForLoadState("networkidle");
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1_000);
  const box = page.getByRole("searchbox", { name: "Search companies" });

  await box.pressSequentially("Ni");
  await page.clock.runFor(1_000);
  await expect.poll(() => held.length, { timeout: 20_000 }).toBe(1);

  // The next keystroke lands just before the "Ni" results arrive.
  await box.press("l");
  await held.shift()?.();
  await expect(page).toHaveURL(/[?&]q=Ni(&|$)/, { timeout: 20_000 });
  await expect(box, "the keystroke typed during the load survives").toHaveValue("Nil");

  // The rest of the query still goes out, and the results match it.
  await page.clock.runFor(1_000);
  await expect.poll(() => held.length, { timeout: 20_000 }).toBe(1);
  await held.shift()?.();
  await expect(page).toHaveURL(/[?&]q=Nil(&|$)/, { timeout: 20_000 });
  await expect(box).toHaveValue("Nil");
  await expect(page.getByRole("link", { name: "Nile Pharma Industries" })).toBeVisible();
  await page.context().close();
});
