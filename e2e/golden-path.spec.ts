import { expect, test } from "@playwright/test";

// Placeholder: requires a running stack (docker compose + db:push + db:seed +
// bun run dev) and @playwright/test installed — see e2e/README.md. Remove the
// skip marker once the disposable test stack lands (Phase 2).
test.describe
  .skip("Phase 1 golden path", () => {
    test("register → verify → list → RFQ → quote → order → deliver", async ({ page }) => {
      await page.goto("/register");
      await expect(page.getByRole("heading", { name: /create your company/i })).toBeVisible();
      // 1. Register a company and land on the pending-verification status page.
      // 2. As the seeded super admin, approve the company in /admin/verification.
      // 3. As the supplier, publish the profile and a listing in /catalogue.
      // 4. As the buyer, raise an RFQ, then accept the supplier's quotation.
      // 5. As the seller, advance shipment stages on /orders/[id] to DELIVERED.
    });
  });
