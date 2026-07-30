import { expect, test } from "@playwright/test";
import { API_PATH, signIn } from "./helpers";

/**
 * Read-only audit of the target stack: reports which conditional guards in the
 * suite would skip, and how much data a full run has left behind. Creates
 * nothing. Not part of the regression signal — run it explicitly.
 */
test("audit: skip conditions and data footprint", async ({ browser }) => {
  const buyer = await signIn(browser, "ops@nilepharma.demo");
  const admin = await signIn(
    browser,
    "admin@pharmachain.local",
    process.env.SEED_SUPER_ADMIN_PASSWORD ?? "admin-ChangeMe-1",
  );

  const json = async (page: typeof buyer, path: string) => {
    const res = await page.request.get(`${API_PATH}${path}`);
    return res.status() === 200 ? await res.json() : null;
  };
  const list = (b: unknown) =>
    (Array.isArray(b) ? b : ((b as { items?: unknown[] })?.items ?? [])) as Record<
      string,
      unknown
    >[];

  // --- why tests skip ---
  const unread = await json(buyer, "/notifications/unread-count");
  const orders = list(await json(buyer, "/orders"));
  const noEta = orders.filter((o) => o.eta == null);
  const listings = list(await json(buyer, "/catalogue/search?page=1"));

  console.log("\n=== skip conditions ===");
  console.log(
    `  regression throttle test : E2E_PROXY_SECRET ${process.env.E2E_PROXY_SECRET ? "set" : "NOT set -> SKIPS"}`,
  );
  console.log(
    `  checklist case 108       : unread notifications = ${(unread as { count?: number })?.count ?? "?"}${((unread as { count?: number })?.count ?? 0) === 0 ? " -> SKIPS" : ""}`,
  );
  console.log(
    `  checklist case 119       : orders without an ETA = ${noEta.length}${noEta.length === 0 ? " -> SKIPS" : ""}`,
  );
  console.log(
    `  checklist cases 57/58    : published listings = ${listings.length} (tops itself up to 5)`,
  );

  // --- what a run leaves behind ---
  const stats = await json(admin, "/admin/stats");
  const companies = list(await json(admin, "/admin/companies?q=Route%20Test%20Pharma"));
  const rfqs = list(await json(buyer, "/rfqs"));
  const e2eRfqs = rfqs.filter((r) => /E2E-/.test(String(r.title ?? "")));
  const fixtures = listings.filter((l) => /Compare Fixture/.test(String(l.name ?? "")));

  console.log("\n=== data footprint on this stack ===");
  console.log(`  platform totals      : ${JSON.stringify(stats)}`);
  console.log(`  "Route Test Pharma"  : ${companies.length} companies from the register test`);
  console.log(`  RFQs tagged E2E-*    : ${e2eRfqs.length}`);
  console.log(`  "Compare Fixture" listings : ${fixtures.length}`);
  console.log(`  orders total         : ${orders.length}`);

  expect(stats).toBeTruthy();
  await buyer.context().close();
  await admin.context().close();
});
