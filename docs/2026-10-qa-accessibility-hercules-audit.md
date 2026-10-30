# QA, Accessibility, Responsiveness, Lighthouse & Hercules Design System Audit (2026-10-25)

A code-grounded quality assurance, accessibility, mobile responsiveness, adaptability, Lighthouse, and UX/UI design system audit of Global PharmaChain as of October 2026. Every finding cites exact `file:line` evidence, maps to October 2026 regulatory and industry standards (WCAG 2.2 AA/AAA, European Accessibility Act, ADA Title II / HHS 2026 digital health mandate, Lighthouse 12/13 Core Web Vitals, and the Hercules UX/UI Design System for high-stakes enterprise healthcare/pharma workflows), and is verified against the production build with automated Playwright, axe-core (`wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`, `wcag22aa`, `best-practice`), and Lighthouse suites.

---

## 1. Verified October 2026 Standards & Research Foundation

1. **WCAG 2.2 AA / AAA & 2026 Regulatory Enforcement (EAA & HHS / ADA Title II)**:
   - **SC 2.4.11 Focus Not Obscured (Minimum) & Technique C43**: Sticky headers on marketing and authenticated views must never obscure keyboard-focused elements when tabbing backward (`Shift+Tab`) or jumping to hash anchors (`html { scroll-padding-top: 4.5rem; }`).
   - **SC 2.5.8 Target Size (Minimum)**: Interactive controls on fine pointers must meet a 24×24 CSS pixel minimum (`size-6` / `min-h-6`), expanding to 44×44 CSS pixels (`2.75rem`) on coarse pointers (`@media (pointer: coarse)`).
   - **SC 1.4.1 Use of Color (`link-in-text-block`)**: Links embedded inside sentences or prose blocks must carry a persistent non-color indicator (`underline underline-offset-2`), not hover-only underlines.
   - **SC 1.4.10 Reflow**: Zero horizontal scroll at `320px` CSS width (`400%` zoom on a `1280px` desktop) across all views, forms, popovers, and data cards.
   - **SC 1.3.1 / 2.4.6 / 4.1.2 Semantic Landmarks, Heading Order & Form Labels**: Every route must expose a visible `<h1>`, maintain a non-skipping heading outline (`h1 → h2 → h3`), contain all visible content inside semantic landmarks (`header`, `main`, `nav`, `footer`, `role="region"`), and associate every `<input>`, `<select>`, `<textarea>`, and checkbox group (`<fieldset>` + `<legend>`) with an explicit programmatic label.
2. **Hercules UX/UI Design System Inspiration for High-Stakes Pharma Systems**:
   - **Dual-Font Typographic Discipline**: Combines a neutral geometric/humanist UI sans-serif (`Geist` across weights `400` body, `500` interactive controls, `600` section/panel headers, `700` display headlines) with `Geist Mono` (`preload: false`) for cryptographic hashes, API keys, and reference codes. Eliminates the separate `Anton` all-caps poster webfont that caused a late font-swap LCP penalty and visual shouting.
   - **Clinical & Financial Numeric Clarity**: Tabular numerals with slashed zeroes (`font-variant-numeric: tabular-nums slashed-zero`) across all data tables and `.num-col` columns so `0` and `O` are never confused in CAS numbers, batch IDs, order references, or dosages; proportional numerals (`proportional-nums`, `-0.025em` tracking, `600` weight) on standalone display KPIs (`.figure`).
   - **8pt / 4pt Spatial Grid & Structural Calmness**:
     - Continuous `56px` (`h-14`) horizontal datum line across the sticky sidebar brand header and top application bar.
     - Explicit `border-t` separation for the pinned tenant `CompanyCard` at the foot of the sidebar.
     - Unified `16px` (`rounded-2xl`) radius, `20px` (`px-5` / `py-5`) internal rhythm, and `--shadow-tile` elevation across both `Panel` (analytical surfaces) and `Card` (operational/form surfaces).
     - `.panel-table` alignment so flush tables inside panels align their outer columns to the exact `20px` (`1.25rem`) header/footer grid line.
     - Calm, stationary resting surfaces (no continuous 60fps floating/bobbing card animations or per-frame `backdrop-filter` / `feGaussianBlur` re-sampling).

---

## 2. Phase-by-Phase Audit Findings & Applied Remediations

### Phase 1 — Removal of AI Emojis & Replacement with Library Icons (`lucide-react`)

| ID | Location (`file:line`) | Gap Identified | Fix Applied |
| --- | --- | --- | --- |
| **ICON-01** | `apps/web/src/components/notifications-bell.tsx:70` | Empty notification dropdown rendered `"All caught up 🎉"`, and notification rows lacked semantic icons. | Replaced `🎉` with Lucide `CheckCircle2` (`text-success`) + `"All caught up"`. Added `notificationIconFor()` mapping every `NotificationType` to its semantic Lucide icon (`ShieldCheck`, `Award`, `Star`, `Inbox`, `Truck`, `FileText`, `MessageSquare`, `Megaphone`, `Wallet`, `ShieldAlert`, `LifeBuoy`, `Bell`) and `cleanNotificationText()` to strip any legacy emojis/dingbats at render time. |
| **ICON-02** | `apps/web/src/app/(app)/notifications/notifications-panel.tsx:62-88` | Full `/notifications` list rendered plain text rows without event icons and could display legacy emojis from older DB rows. | Wired `notificationIconFor()` in `.tile-chip` and `cleanNotificationText()` into every notification row. |
| **ICON-03** | `apps/web/src/components/ratings.tsx:83,241` & `apps/web/src/components/kpi-widgets.tsx:70` | Rating toast, role rating badges, and KPI supplier score tiles used raw Unicode star dingbats (`★`). | Replaced `★` in `CompanyRatings` role badges with Lucide `<Star className="size-3 fill-warning text-warning" aria-hidden="true" />` + `<span className="sr-only">/5</span>`, normalized KPI values to `/ 5`, and added Lucide `BadgeCheck` to the Trusted supplier badge on `/intelligence`. |
| **ICON-04** | `apps/api/src/modules/admin/admin.service.ts:125`, `apps/api/src/modules/rfq/rfq.service.ts:642`, `apps/api/src/jobs/housekeeping.ts:473-474`, `apps/api/src/modules/analytics/analytics.service.ts:201,263`, `apps/api/src/modules/analytics/rating.service.ts:69`, `apps/api/src/modules/intelligence/intelligence.service.ts:250`, `packages/email/src/templates.ts:102` | Backend notification generators, KPI aggregators, intelligence reasons, and verification email templates embedded `🎉`, `🏅`, and `★`. | Removed all emojis and star dingbats across API services, scheduled jobs, and email templates; added a unit test in `packages/email/src/templates.test.ts` guarding against emoji regressions. |
| **ICON-05** | `apps/web/src/app/globals.css:149-150` | `--font-sans` font stack included `"Apple Color Emoji", "Segoe UI Emoji"`. | Removed emoji font fallbacks from `--font-sans`. |

### Phase 2 — Accessibility Remediation (WCAG 2.2 AA/AAA, Landmarks, Headings, Labels & Target Sizes)

| ID | Location (`file:line`) | Gap Identified | Fix Applied |
| --- | --- | --- | --- |
| **A11Y-01** | `packages/ui/src/components/command.tsx:30-31` | `<DialogTitle className="sr-only">` (`<h2>`) and `<DialogDescription className="sr-only">` were placed outside `<DialogContent>`, injecting a hidden `<h2>Command palette</h2>` inside `<header>` before `<main><h1>` on every authenticated page even when closed. | Moved `<DialogTitle>` and `<DialogDescription>` inside `<DialogContent>`. |
| **A11Y-02** | `apps/web/src/app/(auth)/privacy/page.tsx:11`, `apps/web/src/app/(auth)/disclaimer/page.tsx:19,33,47`, `apps/web/src/app/page.tsx:448`, `apps/web/src/app/(app)/orders/[id]/page.tsx:500`, `apps/web/src/app/(app)/error.tsx:28`, `apps/web/src/app/(auth)/error.tsx:31` | `/privacy` and `/disclaimer` lacked `<h1>` (`CardTitle` renders `<div>`); `/disclaimer` jumped directly to `<h3>`; `#compliance` on `/` used `<h3>` without an `<h2>`; `Order documents` on `/orders/[id]` used `<div>` `CardTitle` above `<h3>` document-kind headings; error boundaries used `<p>` instead of `<h1>` and lacked `role="alert"`. | Added semantic `<h1>` to `/privacy`, `/disclaimer`, and both error boundaries (`role="alert"`); promoted `/disclaimer` subheadings and `#compliance` heading to `<h2>`; wrapped `Order documents` `CardTitle` in `<h2>`. |
| **A11Y-03** | `apps/web/src/app/page.tsx:205,211,252` & `apps/web/src/components/app-shell.tsx:323` | Landing page `/` had no Skip-to-content link and its announcement topbar (`<div className="border-b bg-muted/40">`) sat outside all landmarks (failing axe `region`); `<main id="main">` lacked `tabIndex={-1}`. | Added Skip-to-content link on `/`, added `role="region" aria-label="Platform announcement"` to the topbar, and set `tabIndex={-1}` on `<main id="main">` in both `/` and `AppShell`. |
| **A11Y-04** | `apps/web/src/components/attachment-picker.tsx:26,86,113` & `apps/web/src/app/(app)/rfqs/[id]/panels.tsx:456` | Attachment remove button (`<X />`) had no `aria-label` (WCAG 4.1.2 `button-name` failure), and `AttachmentPicker` did not forward `id` or `aria-label` to `<Input type="file">`. | Added `aria-label={\`Remove ${i.fileName}\`}` to the remove button and wired `id` + `aria-label` onto `<Input type="file">`. |
| **A11Y-05** | `admin/audit/page.tsx:75-76`, `company/members/members-panel.tsx:84`, `company/usage/credit-panel.tsx:164`, `admin/parameters/parameters-panel.tsx:172`, `catalogue/[id]/bom/bom-manager.tsx:111,130,137,168`, `messages/[id]/thread-view.tsx:298`, `admin/companies/[id]/review-panel.tsx:90,290`, `catalogue/listing-form.tsx:520`, `developers/dev-panels.tsx:102,234` | 11 form inputs/textareas across admin, BOM, members, credits, parameters, and messaging relied on `placeholder` alone without `aria-label` or `<Label>`; 3 checkbox groups used unassociated `<Label>` instead of `<fieldset>` + `<legend>`. | Added explicit `aria-label` attributes to all 11 controls and converted all 3 checkbox groups to `<fieldset>` + `<legend>`. |
| **A11Y-06** | `apps/web/src/app/(app)/company/page.tsx:56` & `apps/web/src/app/(app)/dashboard/page.tsx:763` | In-sentence support links inside prose blocks used `hover:underline` only (WCAG 1.4.1 `link-in-text-block`). | Added persistent `underline underline-offset-2`. |
| **A11Y-07** | `saved-searches.tsx:103`, `compare.tsx:87,108,122`, `mall-directory.tsx:338,356`, `messages/[id]/thread-view.tsx:286` | Small icon buttons (`size-3` / `size-5`) and tag chips fell under the 24×24px WCAG 2.5.8 AA floor; `CompareButton` lacked `aria-pressed`; `CompareTray` dialog lacked `<DialogDescription>`; dimmed non-matching storefronts in `MallDirectoryGrid` stayed in the tab order without `aria-hidden` and filter updates lacked an `aria-live="polite"` status count. | Enforced `size-6` / `min-h-6` (24×24px minimum) on all compact buttons/tags, added `aria-pressed`, `<DialogDescription>`, `aria-live="polite"` storefront count, and `aria-hidden` + `tabIndex={-1}` on filtered-out cards. |

### Phase 3 — Mobile Responsiveness, Reflow (320px–1440px), Adaptability & Hercules Design System

| ID | Location (`file:line`) | Gap Identified | Fix Applied |
| --- | --- | --- | --- |
| **RESP-01** | `dashboard/page.tsx`, `page-skeleton.tsx`, `dashboard/stat-tile.tsx`, `dashboard/header.tsx`, `finance/page.tsx`, `admin/finance/page.tsx`, `intelligence/page.tsx`, `orders/[id]/page.tsx`, `admin/companies/[id]/page.tsx`, `company/usage/page.tsx`, `developers/page.tsx` | 18 multi-column CSS grids omitted an explicit `grid-cols-1` base (`repeat(1, minmax(0, 1fr))`), leaving implicit `auto` tracks below the breakpoint. | Added explicit `grid-cols-1` base and unified `gap-4` (`16px`) spacing across all 18 grids, plus an intermediate `lg:grid-cols-3` step in `StatGrid` for 5-tile rows. |
| **RESP-02** | `notifications-bell.tsx:66`, `app-shell.tsx:240,294`, `compare.tsx:99`, `admin/audit/page.tsx:61-76`, `marketplace/page.tsx:103`, `company/page.tsx:63`, `orders/[id]/page.tsx:401` | Fixed-width popovers (`w-80`, `w-72`, `w-56`), filter inputs (`w-52`, `w-40`), `CompareTray`, and 2-column `<dl>` lists could overflow or crowd `320px`–`375px` viewports. | Added `max-w-[calc(100vw-1rem)]` to popovers/trays, `w-full sm:w-*` to filter inputs, and responsive wrapping (`[&_dd]:min-w-0 [&_dd]:break-words`) to `<dl>` lists. |
| **ADAPT-01** | `apps/web/src/app/globals.css` | Missing `scroll-padding-top` (WCAG 2.4.11 C43), `@media (prefers-contrast: more)`, `.glass-card` under `@media (prefers-reduced-transparency: reduce)`, and `@media print` rules for regulatory/audit printouts. | Added `html { scroll-padding-top: 4.5rem; }`, `@media (prefers-contrast: more)` token overrides for light/dark themes, `.glass-card` opaque fallback under `prefers-reduced-transparency: reduce`, and `@media print` chrome suppression. |
| **PERF-01** | `packages/core/src/zod-messages.ts:13`, `apps/web/src/middleware.ts:31`, `apps/web/src/app/layout.tsx:10-18`, `apps/web/src/components/service-worker.tsx:11`, `apps/web/src/app/(auth)/register/register-form.tsx:166` | (1) Zod v4 probed `new Function("")` on client form validation, logging a DevTools CSP `kEvalViolation` issue (`Best Practices: 96`). (2) `/_vercel/speed-insights/script.js` returned 404 `text/html` outside Vercel's edge router, logging console errors (`Best Practices: 96`). (3) `Anton` font download caused a late font-swap LCP penalty (`4.3s` mobile LCP on `/`), and continuous `backdrop-filter` / `feGaussianBlur` animations consumed `~3,050ms` TBT on mobile. (4) Country `<Select>` on `/register` switched from uncontrolled (`undefined`) to controlled on hydration. | (1) Enabled `z.config({ jitless: true })` in `@pharmachain/core`. (2) Added `/_vercel/*` no-op JS handler in `middleware.ts` for non-Vercel hosts. (3) Consolidated display typography onto `Geist` (`700` weight, `-0.028em` tracking), set `preload: false` on `Geist_Mono`, deferred `/sw.js` registration by `2.5s` post-load, added `content-visibility: auto` (`.cv-auto`) to below-the-fold marketing sections, and calmed continuous blur/filter animations. (4) Keyed Country `<Select>` transition (`key={field.value ? "selected" : "empty"}`) so timezone preselection works deterministically on SSR hydration. |

### Phase 4 — Lighthouse & Runtime Optimization
- **Zod v4 Strict-CSP Compatibility** (`packages/core/src/zod-messages.ts`):
  - Enabled `z.config({ jitless: true })` so Zod v4 never probes `new Function("")` in the browser under our strict nonce CSP, eliminating the Chrome DevTools `ContentSecurityPolicyIssue` (`kEvalViolation`) on `/register` and other forms.
- **Speed Insights Loopback Guard & Font/Rendering Optimization** (`apps/web/src/middleware.ts`, `apps/web/src/app/layout.tsx`, `apps/web/src/components/service-worker.tsx`, `apps/web/src/components/hero-globe.tsx`, `apps/web/src/app/globals.css`):
  - Excluded `_vercel/` from `middleware.ts`'s `config.matcher` so Vercel production Speed Insights routes are never intercepted by edge middleware, and guarded `<SpeedInsights />` in `ServiceWorker` against loopback hosts (`localhost`, `127.0.0.1`, `[::1]`) so local standalone/Docker/CI runs never 404.
  - Consolidated display typography onto `Geist` (`700` weight, `-0.028em` tracking), set `preload: false` on `Geist_Mono`, deferred `/sw.js` registration until `2.5s` after `load`, and removed continuous per-frame `backdrop-filter` / `feGaussianBlur` animations.
  - Keyed Country `<Select>` initial transition (`key={field.value ? "selected" : "empty"}`) on `/register` so timezone preselection works deterministically on SSR hydration.

---

## 3. Second-Pass Self-Audit & Government-Grade Hardening (2026-10-25 Follow-Up)

A critical second pass audited our own Phase 1–4 diff plus surrounding regulator-facing surfaces against Section 508, EN 301 549, and WCAG 2.2 AA/AAA. It caught seven subtle defects and inconsistencies—three of them in our own first-pass changes—and fixed them in two additional phases:

| # | Gap Identified in Second Pass | Evidence (`file:line`) | Fix Applied |
| --- | --- | --- | --- |
| **1** | **In-page hash navigation (`/#compliance`, `/#how`) displaced by `content-visibility: auto`.** Our first pass added `.cv-auto` (`content-visibility: auto; contain-intrinsic-size: auto 640px`) to `#mall-directory`, `#platform`, `#how`, and `#compliance`. Because `#mall-directory` (~2,900px on mobile) and `#platform` (~1,500px) are much taller than `640px`, navigating to `/#compliance` calculated scroll offset against the `640px` placeholder and expanded offscreen sections mid-scroll, landing thousands of pixels above `#compliance`. | `apps/web/src/app/globals.css`, `apps/web/src/app/page.tsx`, `apps/web/src/components/mall-directory.tsx` | Removed `.cv-auto` from anchor-targeted sections. Verified in Playwright (`e2e/client-review.spec.ts`): `/#compliance` at `390px` lands directly at the top of the viewport (`0px ≤ top < 200px`). |
| **2** | **`aria-hidden` focus trap & low contrast on filtered-out cards in `MallDirectoryGrid`.** Our first pass set `aria-hidden="true"` and `tabIndex={-1}` on non-matching storefronts while leaving them visible on screen at `opacity-40` with clickable `<button onClick={...}>` children. Pointer-clicking a button inside an `aria-hidden="true"` subtree focuses an element hidden from assistive tech (WCAG 4.1.2 / `aria-hidden-focus`), and `opacity-40` text sits at ~2.1:1 contrast. | `apps/web/src/components/mall-directory.tsx:324-370` | Filtered out non-matching storefronts (`if (!isVisible) return null`) when a search query or tag is active, and added a per-lane empty state (`"No storefronts in this lane match the current filter."`). Verified: zero `[aria-hidden="true"] button` nodes in the DOM when filtered. |
| **3** | **Middleware `/_vercel/` override risked shadowing production Speed Insights on Vercel.** Our first pass intercepted `/_vercel/` inside `middleware.ts` and returned an empty `200 OK` script. Because `_vercel/` was not excluded in `config.matcher`, Edge Middleware on Vercel could intercept `/_vercel/speed-insights/*` in production. | `apps/web/src/middleware.ts:68-72`, `apps/web/src/components/service-worker.tsx` | Removed the `/_vercel/` override from `middleware.ts`, added `_vercel/` to the negative lookahead in `config.matcher`, and mounted `<SpeedInsights />` inside `ServiceWorker` only on non-loopback hostnames (`!LOOPBACK_HOSTS.has(window.location.hostname)`). |
| **4** | **`cleanNotificationText()` regex ordering stripped `★` before converting `4.5★` to `4.5/5`, and notification icons lacked severity tones.** `\u2605` (`★`) falls inside `\u{2600}-\u{27BF}`, so running the emoji-range regex first deleted `★` before `(\d+)\u2605 -> $1/5` could match. Furthermore, every notification icon used `text-primary` regardless of urgency. | `apps/web/src/components/notifications-bell.tsx:36-78`, `apps/web/src/app/(app)/notifications/notifications-panel.tsx:62-88` | Reordered `cleanNotificationText()` to convert `(\d+)\s*\u2605` to `$1/5` *before* stripping `[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]\u{FE0F}?`, and added `notificationToneFor()` (`danger`, `warning`, `success`, `default`) so delivery failures, disputes, customs alerts, and document expiries carry semantic urgency tones in both the bell dropdown and `/notifications`. |
| **5** | **`CardTitle` rendered `<div>` across 50+ authenticated cards, depriving screen-reader users of `<h2>` section navigation.** While `PanelHeader` rendered `<h2>`, `CardTitle` (`packages/ui/src/components/card.tsx:33`) rendered `<div>` because `(auth)` cards nest an `<h1>` inside `<CardTitle>`. | `packages/ui/src/components/card.tsx:26-47`, `apps/web/src/app/(app)/orders/[id]/page.tsx:500` | Updated `CardTitle` to inspect its children: when `children` already contains an `<h1>`–`<h6>` element (as on `(auth)` pages), it renders `<div data-slot="card-title">`; otherwise it renders a semantic `<h2 data-slot="card-title">`. Every card across all authenticated detail, workspace, and admin pages is now a navigable `<h2>` landmark heading. |
| **6** | **Regulator anti-counterfeit portal (`/verify`) hardcoded `/api/backend/trace/verify` and lacked a live status region.** `/api/backend` only exists as a `vercel.json` rewrite; on local standalone or Docker deployments `/verify` always failed with `404`. The verification result box also lacked `role="status"` / `aria-live="polite"` and `/verify` had no `<ThemeToggle />` or Skip-to-content link. | `apps/web/src/app/verify/verify-form.tsx:37,80`, `apps/web/src/app/verify/page.tsx:30-40` | Routed `VerifyForm` through `/api/proxy/trace/verify` (works identically on Vercel, Docker, and standalone), added `role="status" aria-live="polite"` to the verification outcome banner, and added Skip-to-content + `<ThemeToggle />` to `/verify`. |
| **7** | **Dangling `aria-describedby` IDREFs on `FormControl`, missing `role="alert"` on `FormMessage` / inline errors, and free-text countries in bulk CSV onboarding.** (a) `FormControl` (`packages/ui/src/components/form.tsx:96`) always set `aria-describedby={formDescriptionId}` even when the `FormItem` had no `<FormDescription>`, leaving dangling IDREFs in the DOM. (b) `FormMessage`, `parameters-panel.tsx`, and `onboard-clients.tsx` error messages lacked `role="alert"`. (c) `clientOnboardRowSchema` (`packages/core/src/schemas/admin.ts:113`) accepted free-text countries (`"Atlantis"`). | `packages/ui/src/components/form.tsx`, `apps/web/src/app/(app)/admin/parameters/parameters-panel.tsx:78-84`, `apps/web/src/app/(app)/admin/companies/onboard-clients.tsx:340`, `packages/core/src/schemas/admin.ts:110-135` | (a) Synchronously detect `<FormDescription>` in `FormItem` so `FormControl` only includes existing IDs in `aria-describedby` (asserted in `e2e/client-review.spec.ts`: 0 dangling IDs). (b) Added `role="alert"` to `FormMessage`, parameter errors, and CSV errors. (c) Added `resolveCountry()` (normalising ISO-2 codes `"UG"`/`"KE"` and case variants `"uganda"`) + `.refine(isKnownCountry, "Select a country from the list")` to `clientOnboardRowSchema`, verified by unit tests in `packages/core/src/schemas/issue.test.ts`. |

---

## 4. Verification Results (Lighthouse, Axe-Core WCAG 2.2 AA & Playwright)

### Lighthouse 12/13 Scores (Production Standalone Build)

| Route & Viewport | Before (Perf / A11y / Best Practices / SEO) | After (Perf / A11y / Best Practices / SEO) | Key Metric Improvements |
| --- | --- | --- | --- |
| `/ (mobile)` | 55 / 100 / 96 / 100 | **75–97 / 100 / 100 / 100** | LCP `4.3s → 2.4s`, FCP `1.5s → 1.3s`, 100% accurate `#anchor` scroll |
| `/ (desktop)` | 82 / 100 / 96 / 100 | **100 / 100 / 100 / 100** | Perfect `100` across all four categories |
| `/login (mobile)` | 89 / 100 / 96 / 100 | **95 / 100 / 100 / 100** | Zero console errors, `1.1s` FCP |
| `/register (mobile)` | 71 / 100 / 96 / 100 | **81 / 100 / 100 / 100** | Zero CSP `kEvalViolation` inspector issues, zero dangling `aria-describedby` IDs (`Best Practices: 100`) |
| `/disclaimer (mobile)` | 87 / 100 / 96 / 100 | **97 / 100 / 100 / 100** | Semantic `h1 → h2` hierarchy, `100` A11y & Best Practices |
| `/privacy (mobile)` | 88 / 100 / 96 / 100 | **94 / 100 / 100 / 100** | Semantic `h1`, `100` A11y & Best Practices |
| `/verify (mobile)` | 88 / 100 / 96 / 100 | **81–94 / 100 / 100 / 100** | `/api/proxy/trace/verify` routing, `role="status"` live region, `<ThemeToggle />`, `100` A11y/BP/SEO |

### Automated Test & Audit Suite

- **Biome lint & format (`bun run lint`)**: **435 files checked, 0 errors, 0 warnings**.
- **TypeScript (`bun run typecheck`)**: **9 / 9 workspace packages pass (`tsc --noEmit`)**.
- **Unit tests (`bun run test`)**: **251 passed, 0 failed** (`@pharmachain/core` 128, `@pharmachain/api` 92, `@pharmachain/email` 31).
- **Axe-core 4.12 (`wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa, best-practice`)**: **42 / 42 route × theme (`light`, `dark`) × viewport (`320px`, `390px`, `1440px`) combinations clean (0 violations)**.
- **Playwright E2E (`e2e/client-review.spec.ts`)**: **14 / 14 browser verification cases passed** (hero alignment at 4 widths, registration country detection, company types, password policy, heading hierarchy, `scroll-padding-top` WCAG 2.4.11, `320px`/`375px` reflow WCAG 1.4.10, zero emojis, zero dangling `aria-describedby` IDs, `role="alert"` form messages, Zod v4 `jitless` CSP verification, `/#compliance` anchor landing accuracy, and `MallDirectoryGrid` filter accessibility).

---

## 5. Follow-up (2026-10-30): the hero globe moves again

**Why it was still.** Phase 4 above removed "continuous per-frame `backdrop-filter` /
`feGaussianBlur` animations". In `hero-globe.tsx` that meant stripping *every* animation class
from the markup (the keyframes and utilities stayed in `globals.css`, unused), and the same
pass stopped the trade-lane marquee. The real costs were two blurs: the glass orb carried
`backdrop-blur-md` inside the 3D-tilting layer, and the route arcs ran through an SVG glow
filter, so both were re-rendered on every frame. The client asked why the globe no longer
animated.

**What came back, and what did not.** The meridian spin, the orbit ring, the rotating sheen,
the hub pulses, the twinkling stars and a light travelling each supply route. Measurement
ruled out four things, and each stays out with a comment saying why:

| Kept out | Why (Chrome trace, landing page at 1440×900, DPR 2) |
| --- | --- |
| Backdrop blur on the orb; SVG glow filter on the routes | The original problem: re-rendered every frame. |
| The CSS 3D tilt (perspective + `translateZ` layers) | Every frame drew the whole globe through a perspective transform: twice the compositing cost of the same motion flat. |
| A `stroke-dashoffset` sweep along the routes | Repaints the route every frame: **~180–250 ms of main thread per second**. |
| Moving the route light with a motion path (`offset-distance`) or the `rotate` property | Same problem on SVG elements: **~210 and ~280–320 ms/s**. `transform: rotate()` about the route arc's centre costs **~13 ms/s** — so each route is now the circular arc through the old curve's ends and midpoint, and its light rotates along it. |

Main-thread cost of the globe with everything moving: **~32 ms per second** (about 3% of a
core); paused: **0**. The spin, ring and sheen are ~1 ms/s each, the stars ~4, the hub pulses
~9–15. Measured with `browser.startTracing` (top-level tasks summed per thread over a fixed
idle window) on a local production build.

One limit of this machine: headless Chrome without a GPU composites in software, and there
*any* motion inside the globe — even only the stars — keeps the compositor thread near one
core, because the whole globe area is redrawn through every layer stacked on it. Desktop
browsers composite on the GPU, where that is routine work; a machine with GPU acceleration
off would see a real cost, which is one more reason for the pause control below. The globe is
`display: none` below the `lg` breakpoint, so phones never render it.

**Stopping it (WCAG 2.2.2 Pause, Stop, Hide).** Motion that starts on its own, loops for more
than five seconds and sits beside other content must be stoppable. `GlobeMotionToggle` is a
native checkbox ("Pause the globe animation") in the hero's corner, outside the globe's
`aria-hidden` layer; checking it pauses every animation in `.globe-scene` through `:has()`,
with no script, so it works before hydration. It is shown only where the globe is and only
while motion is on (`lg:motion-safe:`); `prefers-reduced-motion` already stops everything
through the global kill switch, and the route lights and hub pulses are invisible at rest so
a stopped globe looks like the still one. Loops use negative delays, so nothing shows its
resting frame first.

**Verified.** `e2e/hero-globe.spec.ts` (4 cases): the loops run and the meridians move; each
route light stays on the globe and ends exactly on its route's end point (< 1.5 px); the pause
control works from the keyboard and freezes every animation, and resumes; under reduced
motion nothing runs and no control is offered; below `lg` neither shows. The motion and pause
cases fail on the previous build, as they should. axe-core (WCAG 2.2 AA + best practice):
0 violations, light and dark, 1440 and 390 px, playing and paused. Pause icon contrast 7.2:1
(measured from pixels; axe has no non-text-contrast rule); focus ring visible in both themes;
reached by Tab after the hero's own controls.

Lighthouse 12.8.2 on the local build, runs interleaved so both variants see the same machine
load (globe moving vs Chrome forced to `prefers-reduced-motion`, i.e. the still globe):
desktop **100 / 100 / 99 / 100** moving vs **100 / 100 / 100** still (one still run errored),
TBT 36–79 ms vs 41–60 ms; Speed Index ~50 ms higher with motion (median 523 vs 479 ms), no
score effect; mobile 93–94 vs 90–91 (the globe is not rendered there). An earlier round taken
while another project's test suite loaded this machine read 71–99 for *both* variants — check
the load before trusting a Lighthouse number here.
