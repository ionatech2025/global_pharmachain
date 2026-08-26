# Performance, loading & robustness audit — findings, remediation and verification (2026-08)

A code-grounded audit of the authenticated app (dashboard, marketplace,
RFQs, orders, catalogue, messages, admin) and the API ran on 2026-08-26:
three independent reviews (performance / loading / robustness), each citing
exact file:line evidence rather than a generic checklist. 16 findings — 3
high, 9 medium, 4 low. Fixed in four phases, each **committed → pushed → CI
green → deployed → verified against production before the next began**, the
same discipline `architecture-review-remediation.md` established. A
follow-up Lighthouse/mobile-responsiveness/accessibility verification pass
then caught two further bugs neither typecheck, lint, build nor the e2e
suite had surfaced — see below.

Two findings from the original audit turned out to be false positives on
closer inspection and were **not** applied — see Phase 2 and Phase 4.

Audit artifact (full findings, severity, confidence notes):
<https://claude.ai/code/artifact/235703d1-d508-4ba3-b077-9a15163fe7a3>

## Phase 1 — High severity ([`4077764`])

| Finding | Fix | Live verification |
| --- | --- | --- |
| A server-side 401 (session expired/revoked between page loads) hit the generic error boundary instead of `/login` — the redirect guard in `apps/web/src/lib/api/server.ts` only checked 403. | Catch 401 alongside 403 in the same guard (`withAuthRedirects`). | A garbage session cookie against `/dashboard` in production lands cleanly on `/login`, not an error page — screenshotted. |
| Accepting a quotation (creates an order) had no busy/disabled guard on its confirm button, unlike every sibling action in the same file — a fast double-click could create two orders. | `busy` state + `disabled` + a pending label, mirroring the working `cancel()` pattern already in the same component. | Full e2e golden path — "buyer accepts the quotation and an order is created" — passed post-deploy. |
| Prisma connection pooling for serverless scale-out was left to an implicit default (`num_physical_cpus*2+1`); the API scales out as one function per concurrent request. | `connection_limit`/`pool_timeout` appended to `DATABASE_URL` in code if not already present — not the full Neon driver-adapter migration, which changes how every query connects and had no way to be tested against the real production database from this environment. | Every e2e test that touches the database (effectively all of them) passed clean immediately after deploy. |

## Phase 2 — Contained medium severity ([`1006047`])

| Finding | Fix | Live verification |
| --- | --- | --- |
| `(auth)` route group had no `error.tsx`; a client error on sign-in/register/reset fell through to `global-error.tsx`'s bare unstyled HTML. | In-context `(auth)/error.tsx`, mirroring `(app)/error.tsx`'s recovery UI, pointed home instead of `/dashboard` (invalid for a signed-out visitor). | Screenshotted normal auth-page rendering post-deploy — the boundary only activates on an actual error, confirmed zero visual/behavioural change to the working path. |
| `/health/ready` checked only the database. | Storage already refuses to boot on a dev-default config (`apps/api/src/env.ts`) — a health-check duplicate would be redundant. SMTP has no such guard and silently falls back to logging instead of sending on misconfig, so its resolved provider is now surfaced in the response body (informational, doesn't change the readiness gate). | `curl /health/ready` → `{"ok":true,"checks":{"email":"smtp"}}` in production. |
| Detail routes (order/RFQ/marketplace/catalogue/company, both company and admin variants) inherited a generic table-row-shaped skeleton that doesn't match how any of them actually render (stacked card sections). | New card-shaped `DetailSkeleton`, wired via `loading.tsx` into all 6 routes. | Network-throttled navigation to a real order in production genuinely caught the new skeleton mid-flight — screenshotted. Lighthouse CLS 0–0.005 (effectively perfect) on all 4 authenticated pages measured. |
| RFQ creation, quotation submit/resubmit/accept and posting a message all rode the generic 300 req/60 s default with no endpoint-specific bound; only auth was tightened. | `@Throttle` overrides sized generously for real business use. | Verified via the *actual* HTTP response headers on a real request: `x-ratelimit-limit: 30`, `x-ratelimit-remaining: 29` — nowhere near exhausted even after this session's own heavy repeated e2e traffic. |
| *Investigated, not applied:* the audit's suggested `AbortSignal.timeout()` fix for SMTP. | Already correctly handled — `packages/email/src/provider.ts` sets `connectionTimeout`/`greetingTimeout`/`socketTimeout` on the nodemailer transport directly. `AbortSignal.timeout()` is fetch-specific and doesn't apply to nodemailer; the audit's grep for that one string pattern missed the equivalent nodemailer-native mechanism. | — |

## Phase 3 — Marketplace streaming ([`db2f0a3`])

Every filter change re-rendered the whole `/marketplace` route behind one
route-level fallback, because `/catalogue/search` (the only fetch that
depends on the filters) was awaited in the same `Promise.all` as
categories/rates/viewer. Split the results table into its own async Server
Component behind `<Suspense>`, keyed on the filter params. Categories/rates/
viewer stay in the outer function — they don't depend on the filters and the
form needs them synchronously.

**Deliberately deferred** (investigated, not fixed this round):

- **Dashboard's one extra sequential round-trip** after its own `Promise.all` — would need `/dashboard/summary` to embed shipment/order data server-side, a backend response-shape change with no way to integration-test against the real database from here.
- **API cold start bootstraps all ~15 modules** even for `GET /health` — inherent to the deliberate single-serverless-function architecture (native Prisma/argon2 deps); worth measuring real-world cold-start impact before spending effort. Live TTFB was 90 ms on every page measured this session, cold or not.
- **Extending OpenTelemetry into the API tier** — `apps/web/src/instrumentation.ts` works because Next's bundler accounts for it; the API is hand-bundled (`scripts/deploy-vercel.sh`), and OTel's auto-instrumentation patches modules at require-time. Getting that ordering right inside a custom bundle, with no way to reproduce the real serverless bundle path locally, risks every API route for a diagnostic improvement.
- **No Partial Prerendering / `dynamicIO` / React Compiler** — `apps/web/next.config.ts` has none enabled. Needs a per-route-family evaluation, not a blanket flip.

## Phase 4 — Low severity ([`260e12b`])

All three raw `<img>` tags the audit flagged turned out to be deliberate,
correctly-reasoned exemptions, not oversights: one is an inline data-URI
signature (`next/image` adds nothing to something already embedded), and two
are signed, expiring URLs, where `next/image`'s own caching would go stale
against a URL that expires — converting either would have been a
regression. The one real, live issue found while checking: a stale
`eslint-disable-next-line` doing nothing (ESLint isn't in this project
anymore) left Biome's `noImgElement` rule firing uncontested on
`companies/[id]/page.tsx`; replaced with the correct `biome-ignore` comment
already used for the identical pattern next door.

## Verification pass — Lighthouse, mobile responsiveness, accessibility

Landing page (`/`): mobile 94/100/100/100, desktop 99/100/100/100 —
unchanged, confirmed stable. Lighthouse against the *authenticated* app
needed a real session (signed in as a seeded demo account, session cookie
passed via `--extra-headers`) — a first-time measurement, no prior baseline.
Performance is moderate there (57–71) but confirmed via the bootup-time
breakdown to be genuine client JS execution weight this app shell needs
(react-query, charts, forms) — TTFB was 90 ms throughout, ruling out cold
start as the cause. Accessibility scored 100 on every authenticated page
measured; confirmed by hand too, not just axe: a working skip-to-content
link, correct dialog focus management and Escape-to-close (Radix), and
genuine visible focus rings confirmed via real keyboard Tab traversal.

**Production bug caught by live verification (not by typecheck, lint, build
or the 47/50-passing e2e run):** every authenticated page served
`<link rel="canonical" href=".../">` and `og:url=".../">` — the *homepage*,
not their own path — because the canonical/OG fields from an earlier
session's landing-page fix lived on the root layout with a hardcoded `"/"`.
Next doesn't deep-merge `openGraph`/`alternates` across the layout tree;
whichever level declares them wins wholesale, so the root's `"/"` silently
applied everywhere. Moved to the landing page's own metadata
([`658352d`]) — SEO went 92→100 on every authenticated page checked, `/`
unaffected.

**A second bug the first fix attempt didn't catch, only found by
re-measuring:** a mobile-viewport sweep of the authenticated app (13 routes
× 2 widths) found real horizontal overflow on RFQ detail (422 px), order
detail (59 px) and messages (135 px). Adding `min-w-0` to the shared `Card`
component ([`7dbedf0`]) — modelled on the identical, already-correct pattern
in the `Panel` component — didn't move the RFQ/order numbers *at all* on
re-deploy. Tracing the live ancestor chain found the real cause:
`grid gap-4 lg:grid-cols-3` with no base column count. Below `lg`, CSS Grid
auto-places the children as separate side-by-side implicit columns instead
of stacking them, and an auto-sized implicit column isn't constrained to the
viewport — no amount of `min-w-0` downstream fixes a column that was never
narrow to begin with. The same pattern, unexercised until this sweep, was in
5 places, including one introduced by this session's own Phase 2
(`DetailSkeleton`). Fixed all five with an explicit `grid-cols-1` base
([`0b6f680`]) — re-swept all 26 route×width combinations: zero overflow
everywhere.

## Verification methodology

Every phase: Biome → `tsc --noEmit` (whole monorepo — `packages/ui` changes
touch every consumer) → `next build` → commit → push → CI green
(`gh run list`) → `scripts/deploy-vercel.sh` from the repo root (confirm the
`Aliased` line) → a phase-specific live check against production, signed in
as a real seeded demo account where the finding required it, not just an
anonymous curl → the full e2e suite
(`E2E_BASE_URL=https://global-pharmachain.vercel.app`, baseline 49 passed /
1 skipped). One run that day hit a pre-existing e2e fixture fragility
unrelated to any of this work (`checklist.spec.ts` case 108 picks the first
"OPEN" RFQ without checking who owns it; enough same-day demo data had
accumulated that a self-owned RFQ sorted first for the test's supplier
account) — confirmed directly by replaying the exact request by hand
(403 `FORBIDDEN`, rate-limit headers showing 29/30 remaining, ruling out the
new throttles from Phase 2). Not fixed here — test-fixture maintenance, a
different concern from the application-behaviour scope of this audit.

[`4077764`]: https://github.com/ionatech2025/global_pharmachain/commit/4077764de6a8700d9bcd640d0cdb78752e400991
[`1006047`]: https://github.com/ionatech2025/global_pharmachain/commit/10060478f77939543592df08d6919ab7bffa9670
[`db2f0a3`]: https://github.com/ionatech2025/global_pharmachain/commit/db2f0a3897f23972376b38c4ad2662250e423ee8
[`260e12b`]: https://github.com/ionatech2025/global_pharmachain/commit/260e12b5512610730048cff7a357f964257a3bae
[`658352d`]: https://github.com/ionatech2025/global_pharmachain/commit/658352d472e5a5defe8548ac4f56703eed9d00ad
[`7dbedf0`]: https://github.com/ionatech2025/global_pharmachain/commit/7dbedf0ac8193eb331c3bbf66aca7019b3e1eb3f
[`0b6f680`]: https://github.com/ionatech2025/global_pharmachain/commit/0b6f680e3b629ca7258b8224aa75a6b4a46756e0
