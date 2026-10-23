import { createHmac, randomBytes } from "node:crypto";
import { type Browser, expect, type Page, test } from "@playwright/test";
import {
  ADMIN_PASSWORD,
  API_PATH,
  apiOrigin,
  registerCompany,
  signIn,
  signInFresh,
} from "./helpers";

/**
 * Client review of 2026-10-20/22 (COMMENTS ON PHARMACHAIN WEBSITE_CLIENT.pdf).
 * One block per comment that changed behaviour, so a regression names the
 * comment it undoes.
 *
 * Cases that create companies are self-contained (unique names, own accounts)
 * and leave only an archived, anonymised company behind.
 */

const SUPER_ADMIN = "admin@pharmachain.local";
const NILE_ADMIN = "admin@nilepharma.demo";
const NILE_OPS = "ops@nilepharma.demo";
const PASSWORD = "review-lifecycle-passphrase-qa";
const IS_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(
  process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
);
const AUTH_SECRET = process.env.E2E_PROXY_SECRET ?? "";
const PROXY_SECRET = AUTH_SECRET
  ? createHmac("sha256", AUTH_SECRET).update("pharmachain/proxy-identity/v1").digest("hex")
  : "";

const uniq = () => randomBytes(4).toString("hex").toUpperCase();

/** next-themes reads this key before first paint and re-applies it after
 *  hydration, so toggling the class by hand loses the race. */
async function useTheme(page: Page, theme: "dark" | "light"): Promise<void> {
  await page.context().addInitScript((t) => localStorage.setItem("theme", t), theme);
}

/** A fresh login page, hydrated: submitting before React attaches posts the form
 *  natively (a GET that wipes the fields), which reads as a failed sign-in. */
async function openLogin(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login", { waitUntil: "networkidle" });
  return page;
}

// ── 3-button hero matrix: text must not clip ─────────────────────────────────

test.describe("hero action matrix (Oct 20: 'text not well aligned')", () => {
  for (const width of [1440, 1024, 768, 390]) {
    test(`three CTAs show their full labels at ${width}px`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width, height: 900 } });
      const page = await ctx.newPage();
      await page.goto("/", { waitUntil: "domcontentloaded" });
      const labels = [
        "Source Raw Materials & Consumables",
        "List Finished Formulations / Capacity",
        "Procure Bulk Finished Medications",
      ];
      const heights: number[] = [];
      for (const label of labels) {
        const cta = page.locator("main a[href^='/register?type=']", { hasText: label }).first();
        await expect(cta).toBeVisible();
        // Nothing may overflow its tile: the old nowrap labels spilled past it.
        const clipped = await cta.evaluate((el) =>
          [...el.querySelectorAll("span")].some(
            (s) => s.getBoundingClientRect().right > el.getBoundingClientRect().right + 0.5,
          ),
        );
        expect(clipped, `"${label}" overflows its button at ${width}px`).toBe(false);
        heights.push(Math.round((await cta.boundingBox())?.height ?? 0));
      }
      if (width >= 768) {
        // Side by side, the three tiles read as one row of equal height.
        expect(new Set(heights).size, `unequal tile heights ${heights}`).toBe(1);
      }
      await ctx.close();
    });
  }

  test("each CTA routes to the lane's own company type, and the directory agrees", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const hrefs = async (selector: string) =>
      page.locator(selector).evaluateAll((els) => els.map((e) => e.getAttribute("href")));
    const hero = await hrefs("main a[href^='/register?type=']");
    // Directory cards and footer repeat the three entry points — same targets.
    for (const target of [
      "/register?type=FINISHED_PRODUCT_MANUFACTURER&action=source_raw",
      "/register?type=FINISHED_PRODUCT_MANUFACTURER&action=list_capacity",
      "/register?type=FINISHED_PRODUCT_DISTRIBUTOR&action=procure_bulk",
    ]) {
      expect(hero.filter((h) => h === target).length, target).toBeGreaterThanOrEqual(2);
    }
    expect(hero.some((h) => h?.includes("RAW_MATERIAL_MANUFACTURER"))).toBe(false);
  });
});

// ── Dropdown visibility ──────────────────────────────────────────────────────

/** Contrast of an option's own colours, read the way the browser resolves them. */
async function optionContrast(
  page: Page,
): Promise<Array<{ label: string; ratio: number; opaque: boolean }>> {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
    const rgba = (css: string) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#000";
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const [r = 0, g = 0, b = 0, a = 0] = ctx.getImageData(0, 0, 1, 1).data;
      return { r, g, b, a: a / 255 };
    };
    const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const f = (v: number) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    return [...document.querySelectorAll("select")].map((select, i) => {
      const option = select.querySelector("option:not(:disabled)") ?? select.options[0];
      const style = getComputedStyle(option as Element);
      const bg = rgba(style.backgroundColor);
      const fg = rgba(style.color);
      const [hi, lo] = [lum(bg), lum(fg)].sort((a, b) => b - a) as [number, number];
      return {
        label: select.getAttribute("aria-label") ?? select.id ?? `select#${i}`,
        ratio: (hi + 0.05) / (lo + 0.05),
        opaque: bg.a === 1,
      };
    });
  });
}

test.describe("native dropdowns are readable in both themes (Oct 20/22)", () => {
  for (const theme of ["dark", "light"] as const) {
    test(`marketplace + team filters, ${theme}`, async ({ browser }) => {
      const page = await signIn(browser, NILE_ADMIN);
      await useTheme(page, theme);
      for (const path of ["/marketplace", "/company/members"]) {
        await page.goto(path, { waitUntil: "networkidle" });
        // Prove the theme really applied — otherwise a "dark" run could be a light one.
        await expect(page.locator("html")).toHaveClass(
          theme === "dark" ? /\bdark\b/ : /^(?!.*\bdark\b)/,
        );
        await expect(page.locator("select").first()).toBeVisible();
        const results = await optionContrast(page);
        expect(results.length).toBeGreaterThan(0);
        for (const r of results) {
          expect(r.opaque, `${path} ${r.label}: option background is transparent`).toBe(true);
          expect(r.ratio, `${path} ${r.label} ${theme}: ${r.ratio.toFixed(2)}:1`).toBeGreaterThan(
            4.5,
          );
        }
      }
      await page.context().close();
    });
  }

  test("platform admin: company type and country pickers, dark", async ({ browser }) => {
    const page = await signIn(browser, SUPER_ADMIN, ADMIN_PASSWORD);
    await useTheme(page, "dark");
    await page.goto("/admin/companies", { waitUntil: "networkidle" });
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await page
      .getByRole("button", { name: /onboard/i })
      .first()
      .click();
    await page.getByText("Single company", { exact: true }).click();
    await page.getByLabel("Company type").waitFor();
    for (const r of await optionContrast(page)) {
      expect(r.opaque, r.label).toBe(true);
      expect(r.ratio, `${r.label}: ${r.ratio.toFixed(2)}:1`).toBeGreaterThan(4.5);
    }
    await page.context().close();
  });
});

// ── Forgot password: identical answer, no mail to strangers ──────────────────

test.describe("reset password (Oct 20: 'if the account doesn't exist … shouldn't be sent')", () => {
  const headers = () =>
    PROXY_SECRET
      ? {
          "x-client-ip": `198.51.100.${Math.floor(Math.random() * 200) + 20}`,
          "x-proxy-secret": PROXY_SECRET,
        }
      : {};

  test("a registered and an unregistered address get the same answer", async ({
    request,
    baseURL,
  }) => {
    const ask = (email: string) =>
      request.post(`${apiOrigin(baseURL)}/auth/password/forgot`, {
        headers: headers(),
        data: { email },
      });
    const unknown = await ask(`nobody-${uniq()}@example.com`);
    const known = await ask("ops@kampalafinechem.demo");
    expect(unknown.status()).toBe(200);
    expect(known.status()).toBe(unknown.status());
    expect(await known.text()).toBe(await unknown.text());
    const body = await known.json();
    // The old response carried `sent: true|false` — the leak itself.
    expect(body).not.toHaveProperty("sent");
    expect(body.message).toMatch(/No email is sent to addresses that are not registered/);
  });

  test("the page says the same thing and never claims an account does not exist", async ({
    page,
  }) => {
    await page.goto("/forgot-password", { waitUntil: "networkidle" });
    await page.getByLabel("Work email").fill(`nobody-${uniq()}@example.com`);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText(/If an active account exists/i).first()).toBeVisible();
    await expect(page.getByText(/no (active )?account (found|exists)/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Try another email" })).toBeVisible();
  });
});

// ── Registration: country ────────────────────────────────────────────────────

test.describe("registration country (screenshot: raw 'Too small' error)", () => {
  // Behind Vercel the visitor's IP (x-vercel-ip-country) decides the country and
  // outranks the browser timezone, so these two describe the no-header case: a
  // local stack. The deployed behaviour has its own case below.
  test("an unmapped timezone is not silently defaulted to Uganda", async ({ browser }) => {
    test.skip(!IS_LOCAL, "a deployed stack resolves the country from the visitor's IP");
    const ctx = await browser.newContext({ timezoneId: "Pacific/Chatham" });
    const page = await ctx.newPage();
    await page.goto("/register", { waitUntil: "networkidle" });
    const trigger = page.getByRole("combobox", { name: /country/i });
    await expect(trigger).toContainText(/select country/i);
    await page.getByRole("button", { name: "Register company" }).click();
    await expect(page.getByText("Select your country")).toBeVisible();
    await expect(page.getByText(/Too small/)).toHaveCount(0);
    await ctx.close();
  });

  test("a mapped timezone preselects the applicant's country", async ({ browser }) => {
    test.skip(!IS_LOCAL, "a deployed stack resolves the country from the visitor's IP");
    const ctx = await browser.newContext({ timezoneId: "Africa/Nairobi" });
    const page = await ctx.newPage();
    await page.goto("/register", { waitUntil: "networkidle" });
    await expect(page.getByRole("combobox", { name: /country/i })).toContainText("Kenya");
    await ctx.close();
  });

  test("a deployed stack preselects the visitor's country from their IP", async ({ page }) => {
    test.skip(IS_LOCAL, "needs the CDN's x-vercel-ip-country header");
    await page.goto("/register", { waitUntil: "networkidle" });
    // Which country depends on where the test runs; that it is chosen at all, and
    // is a real list entry rather than the placeholder, is the behaviour.
    const trigger = page.getByRole("combobox", { name: /country/i });
    await expect(trigger).not.toContainText(/select country/i);
    await expect(trigger).not.toBeEmpty();
  });

  test("the API refuses a country that is not on the list, in words", async ({
    request,
    baseURL,
  }) => {
    const res = await request.post(`${apiOrigin(baseURL)}/auth/register`, {
      headers: PROXY_SECRET
        ? { "x-client-ip": "198.51.100.77", "x-proxy-secret": PROXY_SECRET }
        : {},
      data: {
        company: {
          name: `Atlantis Pharma ${uniq()}`,
          type: "SUPPLIER",
          country: "Atlantis",
          registrationNumber: `ATL-${uniq()}`,
          address: "1 Sunken Road",
          contactPhone: "+256700000000",
        },
        admin: { name: "Test Admin", email: `atl-${uniq()}@example.com`, password: PASSWORD },
      },
    });
    expect(res.status()).toBe(400);
    expect(await res.text()).toMatch(/Select a country from the list/);
  });
});

// ── Company types ────────────────────────────────────────────────────────────

test("every company type the client listed can be chosen at registration", async ({ page }) => {
  await page.goto("/register", { waitUntil: "networkidle" });
  await page.getByRole("combobox", { name: /company type/i }).click();
  for (const label of [
    "Equipment Manufacturer",
    "Laboratory Consumables Supplier",
    "Engineering Services",
    "Project Consultant",
    "Packaging Materials Supplier",
    "Artwork Designer",
    "Medical Center",
    "Wholesale Pharmacy",
    "Finished Product Distributor",
  ]) {
    await expect(page.getByRole("option", { name: new RegExp(label, "i") })).toBeVisible();
  }
});

// ── Legal disclaimer on the platform ─────────────────────────────────────────

test("the legal disclaimer is reachable from inside the signed-in app", async ({ browser }) => {
  const page = await signIn(browser, NILE_ADMIN);
  const notice = page.getByText(/independent B2B matching directory/i).last();
  await expect(notice).toBeVisible();
  await page.getByRole("link", { name: "Legal disclaimer" }).last().click();
  await expect(page).toHaveURL(/\/disclaimer/);
  await expect(page.getByText(/does not directly manufacture, formulate, dispense/i)).toBeVisible();
  await page.context().close();
});

// ── US-104 expiry on every verification document ─────────────────────────────

test("US-104: a TIN upload offers an optional expiry date; a licence requires one", async ({
  browser,
}) => {
  const page = await signIn(browser, NILE_ADMIN);
  await page.goto("/company/verification", { waitUntil: "domcontentloaded" });
  const row = (name: string) => page.locator("li", { hasText: name }).first();

  await row("Tax Identification")
    .getByRole("button", { name: /Upload|Replace/ })
    .click();
  await expect(page.getByLabel(/Expiry date \(optional\)/)).toBeVisible();
  await expect(page.getByLabel(/Expiry date \(optional\)/)).not.toHaveAttribute("required", "");
  await page.keyboard.press("Escape");

  await row("Trading Licence")
    .getByRole("button", { name: /Upload|Replace/ })
    .click();
  const licenceExpiry = page.getByLabel(/^Expiry date$/);
  await expect(licenceExpiry).toBeVisible();
  await expect(licenceExpiry).toHaveAttribute("required", "");
  await page.context().close();
});

// ── Platform admin: member menu and company lifecycle ────────────────────────

async function adminApi(page: Page, method: "get" | "post", path: string, data?: unknown) {
  return page.request[method](`${API_PATH}${path}`, data === undefined ? undefined : { data });
}

test.describe("platform admin company controls (page 12)", () => {
  test("the member menu no longer offers Operations / Finance staff", async ({ browser }) => {
    const page = await signIn(browser, SUPER_ADMIN, ADMIN_PASSWORD);
    const list = await (await adminApi(page, "get", "/admin/companies?q=Nile")).json();
    await page.goto(`/admin/companies/${list.items[0].id}`, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: "Member actions" }).first().click();
    await expect(page.getByRole("menuitem", { name: "Force password reset" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: /Make (Operations|Finance)/i })).toHaveCount(0);
    // Nile Pharma has an active Company Admin, so not even the break-glass item.
    await expect(page.getByRole("menuitem", { name: /Appoint as Company Admin/i })).toHaveCount(0);
    await page.context().close();
  });

  test("the API enforces the same: no lateral roles, no second Company Admin", async ({
    browser,
  }) => {
    const page = await signIn(browser, SUPER_ADMIN, ADMIN_PASSWORD);
    const list = await (await adminApi(page, "get", "/admin/companies?q=Nile")).json();
    const detail = await (
      await adminApi(page, "get", `/admin/companies/${list.items[0].id}`)
    ).json();
    const ops = detail.company.members.find(
      (m: { user: { email: string } }) => m.user.email === NILE_OPS,
    );
    const lateral = await adminApi(page, "post", `/admin/users/${ops.user.id}/role`, {
      role: "FINANCE",
      reason: "QA review: lateral role change must be refused",
    });
    expect(lateral.status()).toBe(400);
    const second = await adminApi(page, "post", `/admin/users/${ops.user.id}/role`, {
      role: "COMPANY_ADMIN",
      reason: "QA review: company already has an admin",
    });
    expect(second.status()).toBe(409);
    await page.context().close();
  });

  test("deactivate → reactivate → delete: a company's whole lifecycle", async ({ browser }) => {
    test.setTimeout(180_000);
    const tag = uniq();
    const name = `Review Lifecycle ${tag} Ltd`;
    const email = `lifecycle-${tag.toLowerCase()}@example.com`;
    const admin = await signIn(browser, SUPER_ADMIN, ADMIN_PASSWORD);

    // A fresh, never-traded company to act on.
    const reg = await registerCompany(admin, {
      company: {
        name,
        type: "SUPPLIER",
        country: "Uganda",
        registrationNumber: `LC-${tag}`,
        address: "Plot 1, Lifecycle Road",
        contactPhone: "+256700000001",
      },
      admin: { name: "Lifecycle Admin", email, password: PASSWORD },
    });
    expect(reg.status(), await reg.text()).toBeLessThan(300);
    const found = await (
      await adminApi(admin, "get", `/admin/companies?q=${encodeURIComponent(name)}`)
    ).json();
    const id: string = found.items[0].id;

    // Deletion is a second step: refused while the company is merely active.
    const early = await adminApi(admin, "post", `/admin/companies/${id}/delete`, {
      reason: "QA review: delete before suspend",
      confirmName: name,
    });
    expect(early.status()).toBe(409);

    // Deactivate.
    const suspend = await adminApi(admin, "post", `/admin/companies/${id}/suspend`, {
      reason: "QA review: suspend the lifecycle company",
    });
    expect(suspend.status()).toBe(200);
    const again = await adminApi(admin, "post", `/admin/companies/${id}/suspend`, {
      reason: "QA review: suspend twice",
    });
    expect(again.status()).toBe(409);

    // Its member is refused at sign-in — with the reason, after the right password.
    const blocked = await openLogin(browser);
    await blocked.getByLabel("Work email").fill(email);
    await blocked.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await blocked.getByRole("button", { name: "Sign in" }).click();
    await expect(blocked.getByText(/access has been suspended/i)).toBeVisible();
    await expect(blocked).toHaveURL(/\/login/);
    // A wrong password still gets the generic message — nothing is confirmed to a guesser.
    await blocked.getByLabel("Password", { exact: true }).fill("Wrong-Pass-9");
    await blocked.getByRole("button", { name: "Sign in" }).click();
    await expect(blocked.getByText("Invalid email or password")).toBeVisible();
    await blocked.context().close();

    // Reactivate: never verified, so it goes back to the queue — not to VERIFIED.
    const reactivate = await adminApi(admin, "post", `/admin/companies/${id}/reactivate`, {
      reason: "QA review: reactivate the lifecycle company",
    });
    expect(reactivate.status()).toBe(200);
    expect((await reactivate.json()).status).toBe("PENDING_VERIFICATION");
    const back = await signInFresh(browser, email, PASSWORD);
    await back.context().close();

    // Suspend again, then delete: the typed name must match.
    await adminApi(admin, "post", `/admin/companies/${id}/suspend`, {
      reason: "QA review: suspend before deleting",
    });
    const wrongName = await adminApi(admin, "post", `/admin/companies/${id}/delete`, {
      reason: "QA review: wrong confirmation name",
      confirmName: "Some Other Company",
    });
    expect(wrongName.status()).toBe(400);
    const del = await adminApi(admin, "post", `/admin/companies/${id}/delete`, {
      reason: "QA review: delete the lifecycle company",
      confirmName: name.toLowerCase(),
    });
    expect(del.status(), await del.text()).toBe(200);

    // Archived: hidden from the default list, visible when asked for, PII gone.
    const defaultList = await (
      await adminApi(admin, "get", `/admin/companies?q=${encodeURIComponent(name)}`)
    ).json();
    expect(defaultList.items).toHaveLength(0);
    const deletedList = await (
      await adminApi(admin, "get", `/admin/companies?q=${encodeURIComponent(name)}&status=DELETED`)
    ).json();
    expect(deletedList.items).toHaveLength(1);
    const detail = await (await adminApi(admin, "get", `/admin/companies/${id}`)).json();
    expect(detail.company.verificationStatus).toBe("DELETED");
    expect(detail.company.primaryContactEmail).toMatch(/@anonymized\.invalid$/);
    expect(detail.company.members[0].user.name).toBe("Deleted User");
    expect(detail.company.members[0].user.email).toMatch(/@anonymized\.invalid$/);

    // Gone for good: neither suspend nor reactivate applies, and sign-in fails.
    const afterReactivate = await adminApi(admin, "post", `/admin/companies/${id}/reactivate`, {
      reason: "QA review: reactivate a deleted company",
    });
    expect(afterReactivate.status()).toBe(409);
    const gone = await openLogin(browser);
    await gone.getByLabel("Work email").fill(email);
    await gone.getByLabel("Password", { exact: true }).fill(PASSWORD);
    await gone.getByRole("button", { name: "Sign in" }).click();
    await expect(gone.getByText("Invalid email or password")).toBeVisible();
    await gone.context().close();

    // The address is free again (the member was anonymised, not just disabled).
    const reuse = await registerCompany(admin, {
      company: {
        name: `${name} Reborn`,
        type: "SUPPLIER",
        country: "Uganda",
        registrationNumber: `LC2-${tag}`,
        address: "Plot 2, Lifecycle Road",
        contactPhone: "+256700000002",
      },
      admin: { name: "Lifecycle Admin", email, password: PASSWORD },
    });
    expect(reuse.status(), await reuse.text()).toBeLessThan(300);
    await admin.context().close();
  });

  test("deletion is refused while orders are in flight", async ({ browser }) => {
    // Suspends a seeded company for a moment, which signs its members out —
    // acceptable on a local stack, not on a shared deployment.
    test.skip(!IS_LOCAL, "suspends a seeded company; local stack only");
    const admin = await signIn(browser, SUPER_ADMIN, ADMIN_PASSWORD);
    const list = await (await adminApi(admin, "get", "/admin/companies?q=Nile")).json();
    const { id, name } = list.items[0];
    try {
      const obligations = await (
        await adminApi(admin, "get", `/admin/companies/${id}/obligations`)
      ).json();
      expect(obligations.openOrders).toBeGreaterThan(0);
      await adminApi(admin, "post", `/admin/companies/${id}/suspend`, {
        reason: "QA review: prove deletion is blocked by open orders",
      });
      const del = await adminApi(admin, "post", `/admin/companies/${id}/delete`, {
        reason: "QA review: attempt to delete with open orders",
        confirmName: name,
      });
      expect(del.status()).toBe(409);
      expect(await del.text()).toMatch(/not yet delivered/);
    } finally {
      const back = await adminApi(admin, "post", `/admin/companies/${id}/reactivate`, {
        reason: "QA review: restore the seeded company",
      });
      expect((await back.json()).status).toBe("VERIFIED");
    }
    await admin.context().close();
  });
});

// ── Password policy: NIST SP 800-63B-4 (applied 2026-10-23) ──────────────────

test.describe("password policy", () => {
  const registrationWith = (password: string) => {
    const tag = uniq();
    return {
      company: {
        name: `Policy Probe ${tag} Ltd`,
        type: "SUPPLIER",
        country: "Uganda",
        registrationNumber: `PP-${tag}`,
        address: "Plot 3, Policy Road",
        contactPhone: "+256700000003",
      },
      admin: { name: "Policy Probe", email: `policy-${tag.toLowerCase()}@example.com`, password },
    };
  };

  test("the form states the rule the API enforces", async ({ page }) => {
    await page.goto("/register", { waitUntil: "networkidle" });
    await expect(page.getByText(/At least 15 characters/)).toBeVisible();
    await expect(page.getByText(/letter and a number/i)).toHaveCount(0);
  });

  test("a password under 15 characters is refused, and told why", async ({ page }) => {
    const res = await registerCompany(page, registrationWith("Passw0rd!x12"));
    expect(res.status()).toBe(400);
    expect(await res.text()).toMatch(/at least 15 characters/i);
  });

  test("a commonly used password is refused, with the reason, even though it is long enough", async ({
    page,
  }) => {
    const res = await registerCompany(page, registrationWith("passwordpassword"));
    expect(res.status()).toBe(400);
    expect(await res.text()).toMatch(/commonly used/i);
  });

  test("a straight run of characters is refused", async ({ page }) => {
    const res = await registerCompany(page, registrationWith("abcdefghijklmnopqrstuvwxyz"));
    expect(res.status()).toBe(400);
    expect(await res.text()).toMatch(/straight run/i);
  });
});
