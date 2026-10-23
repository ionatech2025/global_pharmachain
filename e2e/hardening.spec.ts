import { randomBytes } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";
import { ADMIN_PASSWORD, API_PATH, registerCompany, signIn } from "./helpers";

/**
 * Hardening found by auditing the 2026-10-22 company-lifecycle release
 * (docs/2026-10-client-review.md, "Audit follow-up"). Each case pins one way the
 * lifecycle could have gone wrong under real use: two admins acting at once, and
 * a counterparty acting on a company that has since been suspended.
 */

const SUPER_ADMIN = "admin@pharmachain.local";
const BUYER_ADMIN = "admin@nilepharma.demo";
const SUPPLIER_ADMIN = "admin@kampalafinechem.demo";
const PASSWORD = "hardening-race-passphrase-qa";
const IS_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(
  process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
);

const uniq = () => randomBytes(4).toString("hex").toUpperCase();

async function post(page: Page, path: string, data?: unknown) {
  return page.request.post(`${API_PATH}${path}`, data === undefined ? undefined : { data });
}

async function get<T>(page: Page, path: string): Promise<T> {
  return (await (await page.request.get(`${API_PATH}${path}`)).json()) as T;
}

/** A never-traded company with one admin, plus the id the platform admin sees. */
async function freshCompany(admin: Page, label: string) {
  const tag = uniq();
  const name = `Hardening ${label} ${tag} Ltd`;
  const reg = await registerCompany(admin, {
    company: {
      name,
      type: "SUPPLIER",
      country: "Uganda",
      registrationNumber: `HD-${tag}`,
      address: "Plot 9, Hardening Road",
      contactPhone: "+256700000009",
    },
    admin: {
      name: "Hardening Admin",
      email: `hardening-${tag.toLowerCase()}@example.com`,
      password: PASSWORD,
    },
  });
  expect(reg.status(), await reg.text()).toBeLessThan(300);
  const found = await get<{ items: Array<{ id: string }> }>(
    admin,
    `/admin/companies?q=${encodeURIComponent(name)}`,
  );
  return { id: found.items[0]?.id as string, name };
}

test.describe("company lifecycle under concurrency", () => {
  test("a burst of simultaneous suspends: exactly one wins", async ({ browser }) => {
    test.setTimeout(120_000);
    const admin = await signIn(browser, SUPER_ADMIN, ADMIN_PASSWORD);
    const { id } = await freshCompany(admin, "Race");
    const reason = { reason: "QA hardening: simultaneous suspend" };

    // Eight at once: two is too gentle to open the read-then-write window.
    const results = await Promise.all(
      Array.from({ length: 8 }, () => post(admin, `/admin/companies/${id}/suspend`, reason)),
    );
    const codes = results.map((r) => r.status()).sort();
    expect(
      codes.filter((c) => c === 200),
      `statuses: ${codes}`,
    ).toHaveLength(1);
    expect(
      codes.filter((c) => c === 409),
      `statuses: ${codes}`,
    ).toHaveLength(7);
    await admin.context().close();
  });

  test("reactivate racing delete never leaves a half-deleted company", async ({ browser }) => {
    test.setTimeout(120_000);
    const admin = await signIn(browser, SUPER_ADMIN, ADMIN_PASSWORD);
    const { id, name } = await freshCompany(admin, "Mix");
    await post(admin, `/admin/companies/${id}/suspend`, {
      reason: "QA hardening: suspend before the race",
    });

    const [reactivate, del] = await Promise.all([
      post(admin, `/admin/companies/${id}/reactivate`, {
        reason: "QA hardening: racing reactivate",
      }),
      post(admin, `/admin/companies/${id}/delete`, {
        reason: "QA hardening: racing delete",
        confirmName: name,
      }),
    ]);
    // Whichever got there first wins; the other must be told no, not "ok".
    expect([reactivate.status(), del.status()].filter((s) => s === 200)).toHaveLength(1);

    const detail = await get<{
      company: {
        verificationStatus: string;
        members: Array<{ user: { name: string; email: string } }>;
      };
    }>(admin, `/admin/companies/${id}`);
    const erased = detail.company.members.every((m) => m.user.name === "Deleted User");
    // The invariant that matters: members are erased if and only if the company is deleted.
    expect(erased).toBe(detail.company.verificationStatus === "DELETED");
    await admin.context().close();
  });
});

test.describe("a quotation outlives its supplier's standing", () => {
  test("a suspended supplier cannot be awarded an order, and can again once reactivated", async ({
    browser,
  }) => {
    // Briefly suspends a seeded company (signing its members out): local stack only.
    test.skip(!IS_LOCAL, "suspends a seeded company; local stack only");
    test.setTimeout(180_000);

    const admin = await signIn(browser, SUPER_ADMIN, ADMIN_PASSWORD);
    const buyer = await signIn(browser, BUYER_ADMIN);
    const supplier = await signIn(browser, SUPPLIER_ADMIN);

    const raised = await post(buyer, "/rfqs", {
      title: `QA hardening award ${uniq()}`,
      quantity: "5",
      unit: "kg",
      targetCompanyType: "RAW_MATERIAL_MANUFACTURER",
      deadline: new Date(Date.now() + 10 * 864e5).toISOString(),
    });
    expect(raised.ok(), await raised.text()).toBe(true);
    const rfqId = (await raised.json()).id as string;

    const quoted = await post(supplier, `/rfqs/${rfqId}/quotations`, {
      unitPrice: "12.50",
      currency: "USD",
      leadTimeDays: 14,
      validUntil: new Date(Date.now() + 30 * 864e5).toISOString(),
      notes: "QA hardening quotation",
    });
    expect(quoted.ok(), await quoted.text()).toBe(true);
    const quotationId = (await quoted.json()).id as string;

    const suppliers = await get<{ items: Array<{ id: string; name: string }> }>(
      admin,
      "/admin/companies?q=Kampala",
    );
    const supplierCompany = suppliers.items[0] as { id: string };
    try {
      await post(admin, `/admin/companies/${supplierCompany.id}/suspend`, {
        reason: "QA hardening: supplier suspended after quoting",
      });
      const refused = await post(buyer, `/quotations/${quotationId}/accept`);
      expect(refused.status()).toBe(409);
      expect(await refused.text()).toMatch(/not currently verified/i);
    } finally {
      const back = await post(admin, `/admin/companies/${supplierCompany.id}/reactivate`, {
        reason: "QA hardening: restore the seeded supplier",
      });
      expect((await back.json()).status).toBe("VERIFIED");
    }

    // Reinstated, the same quotation can be awarded — nothing else was changed.
    const awarded = await post(buyer, `/quotations/${quotationId}/accept`);
    expect(awarded.status(), await awarded.text()).toBeLessThan(300);

    await Promise.all([admin, buyer, supplier].map((p) => p.context().close()));
  });
});
