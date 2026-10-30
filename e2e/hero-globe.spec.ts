import { expect, type Page, test } from "@playwright/test";

/**
 * The landing-page globe moves (2026-10-30). The 2026-10-25 audit had stilled
 * it to stop two blurs re-rendering every frame; the blurs stayed out and the
 * motion came back. Whoever needs it to stop can pause it (WCAG 2.2.2), and
 * with prefers-reduced-motion it never moves at all.
 */
const DESKTOP = { width: 1440, height: 900 };
const LOOPS = ["orbit-spin", "route-dot", "node-ping", "starfield-twinkle"];

type GlobeAnimation = { name: string; state: string };
function globeAnimations(page: Page): Promise<GlobeAnimation[]> {
  return page.evaluate(() => {
    const scene = document.querySelector(".globe-scene");
    return document
      .getAnimations()
      .filter((a) => scene?.contains((a.effect as KeyframeEffect | null)?.target ?? null))
      .map((a) => ({ name: (a as CSSAnimation).animationName, state: a.playState }));
  });
}
const spinAngle = (page: Page) =>
  page.locator(".animate-globe-spin").evaluate((el) => getComputedStyle(el).transform);
const pauseControl = (page: Page) =>
  page.getByRole("checkbox", { name: "Pause the globe animation" });

test.describe("landing-page globe motion", () => {
  test.use({ viewport: DESKTOP });

  test("the globe turns, lights travel its routes and its hubs pulse", async ({ page }) => {
    await page.goto("/");
    const running = (await globeAnimations(page))
      .filter((a) => a.state === "running")
      .map((a) => a.name);
    for (const loop of LOOPS) expect(running, `${loop} is running`).toContain(loop);
    // Moving, not merely declared: the meridians' angle changes.
    const before = await spinAngle(page);
    await expect.poll(() => spinAngle(page)).not.toBe(before);
    // The route lights follow paths given in the globe's own units, so at
    // whatever size the globe renders they stay on its face.
    const globe = await page.locator(".globe-scene svg").boundingBox();
    expect(globe).not.toBeNull();
    for (const light of await page.locator(".animate-route-dot").all()) {
      const b = await light.boundingBox();
      expect(b).not.toBeNull();
      const { x, y, width, height } = b as NonNullable<typeof b>;
      const g = globe as NonNullable<typeof globe>;
      expect(x).toBeGreaterThanOrEqual(g.x);
      expect(y).toBeGreaterThanOrEqual(g.y);
      expect(x + width).toBeLessThanOrEqual(g.x + g.width);
      expect(y + height).toBeLessThanOrEqual(g.y + g.height);
    }
    // Each light finishes where its route does: on its loop's last frame the
    // dot sits on the end of the arc drawn beside it.
    const misses = await page.evaluate(() =>
      [...document.querySelectorAll<SVGGElement>(".animate-route-dot")].map((light) => {
        const run = light.getAnimations()[0] as Animation;
        run.pause();
        // currentTime counts from the start, delay included; the delays are
        // negative so the lights start mid-loop.
        run.currentTime = 4499 + Number(run.effect?.getTiming().delay ?? 0);
        const route = light.previousElementSibling as SVGPathElement;
        const end = route.getPointAtLength(route.getTotalLength());
        const m = (light.ownerSVGElement as SVGSVGElement).getScreenCTM() as DOMMatrix;
        const dot = (light.lastElementChild as SVGCircleElement).getBoundingClientRect();
        return Math.hypot(
          dot.x + dot.width / 2 - (m.a * end.x + m.c * end.y + m.e),
          dot.y + dot.height / 2 - (m.b * end.x + m.d * end.y + m.f),
        );
      }),
    );
    expect(misses).toHaveLength(4);
    for (const miss of misses) expect(miss).toBeLessThan(1.5);
  });

  test("the pause control stops every animation in the globe, from the keyboard too", async ({
    page,
  }) => {
    await page.goto("/");
    const pause = pauseControl(page);
    await pause.focus();
    await page.keyboard.press("Space");
    await expect(pause).toBeChecked();
    await expect
      .poll(async () => (await globeAnimations(page)).every((a) => a.state === "paused"))
      .toBe(true);
    const frozen = await spinAngle(page);
    await page.waitForTimeout(700);
    expect(await spinAngle(page)).toBe(frozen);

    await page.keyboard.press("Space");
    await expect(pause).not.toBeChecked();
    await expect.poll(() => spinAngle(page)).not.toBe(frozen);
  });

  test("with reduced motion nothing moves and no pause control is offered", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: DESKTOP, reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page.locator(".globe-scene")).toBeVisible();
    await expect
      .poll(async () => (await globeAnimations(page)).filter((a) => a.state === "running"))
      .toEqual([]);
    await expect(pauseControl(page)).toBeHidden();
    await ctx.close();
  });

  test("below the desktop layout neither the globe nor its control is shown", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await expect(page.locator(".globe-scene")).toBeHidden();
    await expect(pauseControl(page)).toBeHidden();
  });
});
