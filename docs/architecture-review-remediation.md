# Architecture review — findings, remediation and verification (2026-07)

A principal-level architecture / robustness / performance / UX review of the
deployed platform was run on 2026-07-24 (scope: `main@78632de`, after the
Phase 2–5 roadmap PRs #40–#46). Every finding was remediated the same day in
three phased PRs plus two follow-ups, each **merged → deployed → verified
against production** before the next began. This document is the durable
traceability record: finding → fix → PR → live evidence.

Grades before → after: Operational robustness **C+ → B+** · Security
**B+ → A−** · Performance **B− → B+** · Architecture B+ · UI/UX A− · DX A−.

Review artifact (full findings with code citations, kept updated):
<https://claude.ai/code/artifact/66efd916-896c-4c6b-a3b3-04804c0199c7>

## Phase A — P0, correctness/ops failures ([PR #47])

| Finding | Fix | Live verification |
| --- | --- | --- |
| **The platform had no clock.** All 12 (now 15) scheduled jobs relied on `@nestjs/schedule` timers that never fire on Vercel — RFQs never auto-closed, quotations never expired, retries never ran. | Shared job registry + `GET /jobs/run` dispatcher (constant-time `CRON_SECRET` Bearer; 404 unset / 401 mismatch), driven by GitHub Actions cron (`jobs-frequent.yml` every 10 min, `jobs-daily.yml` 05:00 UTC). Per-job `JobHeartbeat` rows; `/admin/jobs` freshness page. | Dispatcher 401 without secret; 5 frequent + 9 daily jobs ran ok; GH workflow run green in 22s; 14/14 heartbeats present. |
| **Settlement was not atomic.** Payment flip, ledger rows, commission and invoice-PAID were separate writes — a crash mid-sequence diverged the books. | One interactive transaction: conditional flip (409 on replay), `PAYMENT_OUT`/`PAYMENT_IN`/`PLATFORM_FEE` ledger rows, invoice `ISSUED→PAID` from confirmed totals. Invoice numbering retries typed `P2002` only. Payment cap accounts for PENDING amounts. | Exact ledger-row assertions after settlement; replayed settlement → 409; over-cap payment rejected. |
| **8 fire-and-forget async sites** (webhooks, push, outbox…) could be frozen mid-send when the serverless instance suspended. | `defer()` = `waitUntil` from `@vercel/functions` with a detached-promise fallback, wrapped around every site. | Webhook delivery + push observed completing post-response on production. |

## Phase B — P1, failures under realistic conditions ([PR #49], hotfix [PR #50])

| Finding | Fix | Live verification |
| --- | --- | --- |
| **SSRF via outbound webhooks** — any URL was fetched from inside the deployment. | `assertSafeWebhookUrl`: DNS-resolve all addresses, reject private/CGNAT/link-local/multicast/v6-local/v4-mapped ranges, https-only, no credentials; `redirect:"manual"`; unread bodies cancelled. | `https://10.0.0.1`, `169.254.169.254`, `localhost` all → 400; public https endpoint still accepted. |
| **Dead-end payments** — CARD/MOBILE_MONEY were offered with no gateway configured; ESCROW had no path at all. | `enabledPaymentMethods()` gates by configured gateway (`PAYMENT_SANDBOX=1` labels sandbox); `ManualEscrowGateway` with explicit agent instructions; `GET /payments/methods` drives the UI. | Methods endpoint shows bank+escrow always, card/mobile labelled sandbox; escrow initiation returns agent instructions. |
| **Trace-chain race** — simultaneous first views raced on `(orderId, seq)` and 500'd. | Per-order blocking advisory lock inside the extension transaction; tail re-read under the lock. | 5 concurrent trace reads all 200. |
| **Offline queue deleted 401 replays** silently. | Service worker keeps 401s ("sign in to sync"). | SW code path verified in deployed bundle. |
| **Stored locale/timeZone ignored** — all formatting hardcoded `en`. | Dual-store formatter (server: request-scoped `cache()`; client: singleton) primed from the viewer; every `fmt*` honours it. | Saved `fr` locale → server-rendered French dates. |
| **Delay-risk badges overstated sparse data.** | Risk degrades to `UNKNOWN` below 5 baseline samples (past-ETA stays HIGH); `baselineSamples` exposed. | Live payload shows `UNKNOWN` for sparse lanes. |

**Production bug caught by live verification:** the blocking advisory lock was
first written with `$queryRaw`, which cannot deserialize the lock's SQL
`void` return — every trace read 500'd in production. [PR #50] switched it to
`$executeRaw` (the `withJobLock` pattern: boolean-returning `pg_try_…` may use
`$queryRaw`; void-returning `pg_advisory_xact_lock` must not).

## Phase C — P2, scale and quality debt ([PR #51], hotfix [PR #52])

| Finding | Fix | Live verification |
| --- | --- | --- |
| Customs-dwell KPI issued up to 500 sequential queries. | One `LEAD() OVER (PARTITION BY orderId)` windowed query; 60s per-company KPI cache. | KPI endpoint ~1.5s warm. |
| Supplier recommendations were ~3×N per-seller round-trips. | Three grouped queries + in-memory scoring. | Endpoint healthy under seeded data. |
| Trace coverage verified every chain per page view. | Coverage reads sealed chains only; new daily `trace-seal` job seals proactively. | Coverage 100% (12/12 sealed + intact) in 1.5s. |
| `/auth/me` fetched 2–4× per request. | `getViewer()` wrapped in React `cache()`. | Behaviour unchanged; duplicate fetches gone. |
| Order mega-page: fetch waterfall, no in-page nav, `window.prompt`, star-rating a11y, fictional hero numbers. | Parallel fetch wave; sticky section nav (`#progress…#trust`); ConfirmDialog; rating as a labelled `radiogroup` with arrow keys; landing binds live `/stats/public` (5-min cache). | 13/13 Phase C live checks incl. 5-radio radiogroup and live hero counts. |
| Trace PDF was not field-verifiable. | QR (drawn as raw PDF rects from a `qrcode` matrix) encoding a prefilled `/verify?orderNo=…&hash=…`. | PDF contains 1,218 QR draw ops; `/verify` prefills from the QR params. |
| GH Actions unpinned. | All actions pinned by commit SHA. | Workflows green. |

**Production bug caught by live verification:** the first cold `trace-seal`
run did one interactive transaction per order with no bound and died at the
API function's 30s ceiling (`FUNCTION_INVOCATION_TIMEOUT`). [PR #52] made it
incremental — grouped-count staleness detection (a sealed chain only grows,
so `sealed < canonical` means work), newest-first sealing under a 15s budget,
`{checked, stale, sealed, remaining}` telemetry, next run resumes — and
raised `maxDuration` to 60s (deploy script `.vc-config.json`). After the fix
the entire backlog sealed in one 3.7s run. **This is the template for any
future long-running job.**

## Follow-ups — the packaging landmine and observability ([PR #48], [PR #53])

The review left field Web Vitals and OTel export marked *environment-blocked*
because installing `@vercel/speed-insights` or `@vercel/otel` broke
`next build`. Resolving dependabot [PR #48] (auth patch bumps shipped without
a lockfile regen) exposed the truth:

- The regenerated lockfile reshuffled bun's hoisting and reproduced the exact
  `TypeError: b.createContext is not a function` — with **no** @vercel package
  involved.
- Bisection with single-copy installs isolated it: **`@radix-ui/react-slot`
  `1.3.1` evaluates a top-level `createContext()`; under the `react-server`
  condition React has no `createContext`, so the build's page-data collection
  crashes.** `1.3.0` has no top-level call and is immune. The earlier
  "@vercel packages break the build" conclusion was a misattribution — they
  were hoist-reshuffle *triggers*, as was the next-auth patch bump.
- Fix: root `package.json` `"overrides": { "@radix-ui/react-slot": "1.3.0" }`
  → exactly one deterministic copy regardless of future churn (README design
  decision 11 has the diagnosis + unpin protocol).

With the pin in place, [PR #53] shipped `<SpeedInsights />` (root layout;
client-side injection is trusted by the nonce CSP's `'strict-dynamic'`, the
vitals beacon is same-origin) and `@vercel/otel` via
`apps/web/src/instrumentation.ts`. Live: collector served (200) and requested
on real page views, **zero CSP violations**, auth flow re-verified 7/7 after
the next-auth bump.

## Verification methodology

Every phase gated on: Biome exit 0 → `tsc` clean → unit suites → CI → merge →
`bash scripts/deploy-vercel.sh` **from the repo root** (confirm the `Aliased`
line) → a phase-specific Playwright live-check script against production →
the full e2e suite (`E2E_BASE_URL=https://pharmachain-seven.vercel.app`,
34 passed / 1 env-skipped). The live checks caught two real production bugs
(PR #50, PR #52) that unit tests, typecheck and CI all missed — treat
post-deploy verification as part of the change, not an afterthought.

## Deliberately deferred

- **Per-device session revocation** — the stateless-JWT design has no session
  store; needs a `jti` registry. `sessionVersion` bumping (global revocation
  per user) is the shipped mitigation.

[PR #47]: https://github.com/mpairwe7/pharmachain/pull/47
[PR #48]: https://github.com/mpairwe7/pharmachain/pull/48
[PR #49]: https://github.com/mpairwe7/pharmachain/pull/49
[PR #50]: https://github.com/mpairwe7/pharmachain/pull/50
[PR #51]: https://github.com/mpairwe7/pharmachain/pull/51
[PR #52]: https://github.com/mpairwe7/pharmachain/pull/52
[PR #53]: https://github.com/mpairwe7/pharmachain/pull/53
