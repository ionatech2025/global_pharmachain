# Gap analysis — findings, remediation and verification (2026-10)

A code-grounded analysis on 2026-10-11 measured production directly (curl
from East Africa, the API's own `durationMs` logs, `x-vercel-id`) instead of
inferring from the code alone. It found two critical defects and one
performance root cause the earlier audits had misattributed. Fixes shipped in
four phases plus one follow-up, each **lint → typecheck → unit tests → build
→ commit → push → CI green → `scripts/deploy-vercel.sh` → verified live**, the
discipline the 2026-07 and 2026-08 records established.

## Phase 1 — critical ([`a8a96bc`])

| Finding | Fix | Live verification |
| --- | --- | --- |
| Every production email — invitations, password resets, sign-in codes — was BCC'd to a hard-coded personal inbox. Test-recipient routing (added 2026-09-28) defaulted on and could not be disabled by env. | Off in production unless `EMAIL_TEST_ROUTING=true` **and** an explicit `TEST_EMAIL_RECIPIENT`; the built-in default never receives production mail. SMTP-sink tests assert one envelope recipient. | `/health/ready` → `"emailTestRouting": false`. |
| The sandbox payment gateway fell back to a secret published in this repo when `PAYMENT_WEBHOOK_SECRET` was unset (it was), and any provider's webhook could settle any reference. | Production refuses sandbox webhooks without a configured secret; a provider settles only what it initiated, for the recorded currency and at least the recorded amount; constant-time verif-hash. | Unit tests only — production payment endpoints were deliberately not probed. |
| Functions ran in `iad1` (US-East), Neon in `ap-southeast-1` (Singapore): **~240ms per query**, ×3 guard queries per API call. The 2026-08 audit attributed slow authenticated pages to client JS with "TTFB 90ms"; measured TTFB was 1.8–3s and `/dashboard` took 12s. | Every Node function pinned to `sin1`; the script refuses to release otherwise. | `x-vercel-id` `…::sin1::…`; DB round trip 240ms → 0–27ms; sign-in 5.3–9.6s → 1.6s; `/dashboard` 12.0s → ~1.7s; `/marketplace` 8.75s → ~0.7s. |
| The API function was on `nodejs20.x`, which Vercel stopped deploying on 2026-10-01 — the next release would have failed. | `nodejs24.x`. | Released on it. |
| The API function lacked `supportsResponseStreaming`, so the messaging SSE feed was buffered until it closed. | Enabled. | First event 1.23s after connecting, through the web proxy. |
| `bun build` folded `process.env.NODE_ENV` to `"development"` in the API bundle. | Bundled with an explicit production define. | Dev-only branch absent from the bundle. |
| The seed and e2e suite fell back to public default passwords for any target. | Required from the environment for non-local databases / deployed targets. | — |

## Phase 2 — loading and performance ([`30ae9b0`])

| Finding | Fix | Live verification |
| --- | --- | --- |
| The landing page rendered on a function per visit (`await auth()` made it dynamic). | Static with 5-minute ISR; the signed-in redirect moved to the edge middleware. | `x-vercel-cache: PRERENDER/HIT`; TTFB ~450–730ms → ~300ms; signed-in `/` → 307 `/dashboard`. |
| Categories and FX rates cost two authenticated API calls per marketplace/catalogue render. | Public, `Cache-Control`d reference endpoints held in Next's shared data cache. | Edge `HIT`, 90ms. |
| Featured/Premium placement re-sorted only the current page — a paid Featured listing that sorted late never reached page one. | Ranked by the database across the result set. | Query runs; production's 8 listings are all Freemium. |
| Server-rendered API calls carried no client identity, pooling every visitor into the web function's rate-limit bucket. | Forward IP/UA (proved by the proxy credential) and a per-render request id. | `x-request-id` round-trips. |
| Notification email/WhatsApp went out inline: a request waited on an SMTP handshake per recipient, and a frozen function lost the message. | Outbox-first: rows recorded in one insert, delivered after the response, retried by the job, pruned after 30 days. | e2e (below). |
| Each open message thread held an SSE stream and a 20s full re-poll even when hidden; each reconnect re-read the whole thread to check access. | Stream only while visible, poll only while the stream is down, access check loads nothing else; dashboard refresh skips hidden tabs and its second request runs in parallel. | — |

Server-side after Phases 1–2 (API logs): `/catalogue/search` p50 17ms,
`/auth/me` p50 7ms. Client timings from the analysis machine carried
multi-second stalls from its own lossy link; the logs showed none server-side.

## Phase 3 — robustness and security ([`af285cc`])

Lockout lifted by a completed password reset; TOTP codes accepted once and
seeds sealed at rest (AES-256-GCM, key derived from `AUTH_SECRET`); "API
unavailable" no longer reported as "invalid password"; the web tier's proxy
credential is an HMAC of `AUTH_SECRET`, not the secret. Upload cap 4MB (Vercel
refuses request bodies over 4.5MB — the promised 10MB never worked), one label
for every hint; file signatures checked; idempotent completion. Payments and
fee checkouts recorded before the provider call; commission in exact decimals;
fee settlement + tier grant atomic. Thread get-or-create race handled; message
history pages beyond the latest 200. Webhook deliveries claimed before sending,
bounded parallel under a time budget, secrets sealed, test deliveries scoped.
Push endpoints restricted to browser push services (server-side request
forgery); serializable conflicts retried; the proxy refuses cross-site writes
and passes `Retry-After`/rate-limit/request-id through; lapsed sessions return
to the requested page; idleness judged across tabs; downloads navigate instead
of opening a popup Safari blocks.

Live: deep link → `/login?callbackUrl=%2Forders%2Fabc`; cross-site write → 403;
push to `https://10.0.0.5` → 400; history `before` cursor → 200; sign-in through
the derived credential works.

## Phase 4 — operations ([`3741457`], follow-up [`ec2ba52`])

Daily jobs one request each with failure issues; `registry.test.ts` keeps the
workflow and registry in step; the platform dashboard counts stale/failing jobs
(GitHub disables cron in an idle public repo after 60 days). Migration
`20261011000000_lookup_indexes` (additive, matches `prisma migrate diff`). CI
`contents: read`; the migration workflow masks the database host. Sitemap,
robots sitemap line, `security.txt`, `Cross-Origin-Opener-Policy`.

**Regression caught by verification, fixed in [`ec2ba52`]:** making the landing
page static moved its canonical/OG URLs to build time, where a local
`vercel build` has no system variables — production briefly served
`http://localhost:3000` in its canonical URL, share cards, sitemap and robots
(the static 404 had done so all along). The release script now sets
`NEXT_PUBLIC_SITE_URL` and refuses output that still names localhost.

## End-to-end verification

The full suite against production on 2026-10-11 (one retry per test, for this
machine's lossy link): **58 passed, 1 flaky (passed on retry), 7 skipped,
0 failed**. The skips: the throttle test, which needs the deployment's
`AUTH_SECRET` (as always), and six Epic 2 cases whose shared mailbox state did
not carry over a slow first attempt. Run on its own straight after, the Epic 2
spec passed **16/16 with no skips and no retries** — including real invitation
and password-reset mail read from a live inbox, which proves delivery after the
mail-routing and outbox changes. Every test in the suite therefore passed
against production in this round, apart from the secret-gated throttle test.

Four specs were out of date or racy and were fixed ([`fbed418`]): the landing
headline and the registration country select changed on 2026-09-16 and had
failed on every run since; case 108's fixture collided with an earlier run's
quotation (now it raises its own RFQ); and the idle-session post-check raced
the sign-out response (it now waits for it). Each passed against production
after the fix.

## Phase 5 — the analytical surfaces ([`5f16983`], [`28d254e`], [`485ae5a`], [`911bdf6`])

An audit of the dashboard, intelligence and finance charts against the
dataviz method. The palettes themselves were re-validated and pass every gate
in both themes (categorical: worst adjacent CVD ΔE 8.5 light / 10.6 dark,
normal-vision 23.3 / 23.2; ordinal: monotone, one hue, light end 2.21 / 2.69:1).
The defects were in what the charts said and who could read them. Rendering
the surfaces against production data found them; an offline render of the
real components (light, dark, phone) checked each fix before release.

| Finding | Fix |
| --- | --- |
| Price trend plotted months without a quotation as a price of **0**, and averaged unit prices **across currencies** (the provenance line obscured it). | One currency — the most-quoted; others counted and left out, never converted. Empty months are null and the line breaks there; gappy series mark where each run starts and ends. |
| Demand forecast **summed RFQ quantities** (each in its own free-text unit: kg, tablets, litres) while the tile, panel and provenance all said "RFQs" — 37,174 "RFQs" in a month from 64 RFQs. | Counts RFQs raised. "Backtest accuracy" for a MAPE (an error) now reads "Backtest error". |
| Stat tiles showed a **stock** with a delta comparing a **flow**: "Live orders 28 ▼82%" meant orders *placed* per 30 days fell, not live orders. Two tiles never named the delta's subject. | `deltaCaption` names the flow and its comparison ("2 placed in 30 days vs 11 before"); finance tiles name the payment counts their deltas use. |
| Values were reachable only by **mouse hover** or a screen-reader-only table: touch and keyboard users could not read a week's figures; the slots' focus rule was dead code. | Every chart has a "View as table" disclosure — a native `<details>`, still zero client JS. |
| On a phone the charts scrolled but opened on the **oldest** periods — the latest week and the projection started off-screen. | The scroll box opens on the latest data (`dir="rtl"`), with a copy of the y-axis pinned left by a container query exactly while the plot scrolls. |
| Red delta pills **3.95:1 / 4.03:1** (under AA for 11px text); dark `text-destructive` 4.39:1 on the card. | `--destructive-accent` (5.0:1 light, 5.7:1 dark on the tint); the dark `text-destructive` override follows the `text-primary` precedent. |
| Meter warnings were colour-only. | Icon + words ("Nearly used", "Limit reached"), figures in text ink, `aria-valuetext`. |
| Spec drift: dot keys in tooltips, label-first readouts, donut gaps showing a grey track, no donut hover, sparkline wholly in the accent, strokes and ~8px labels scaling with the panel, the last month unlabelled on odd counts. | Line keys and value-first readouts; true 2px surface gaps and a CSS-only donut readout; grey sparkline with the current period in the accent; non-scaling strokes and a forecast viewBox sized to its panel; axis labels thinned from the end. |

The series rules (`apps/api/src/modules/intelligence/series.ts`) have unit tests.

Live: the price series reads USD with nulls for its nine empty months (48
quotations, none in other currencies — so the zeros, not the mixing, were what
production showed); demand counts 64 RFQs, matching its provenance line, and
the backtest error on the honest series is 76.4% MAPE (172% on summed
quantities); every chart serves its table view and every tile names its delta.
The live render also caught a font detail the offline render could not: Geist
sets the decimal point against the foot of a 2, so the tick "12.5" read "125";
tick labels now carry a hair of tracking ([`485ae5a`]). On a phone, line ends
peeked past the pinned axis through the scroll box's 0.25rem gutter; the
pinned copy now covers it ([`911bdf6`]).

The full e2e suite against production after the release: **65 passed,
1 skipped (the secret-gated throttle test), 0 failed, 0 flaky** — every test
that can run from here, including the Epic 2 mailbox chain.

## Follow-ups — prices by category, CI on Node 24 and Ubuntu 26.04 ([`a45e60c`], [`712ae00`], [`407f7c9`])

**Which categories the price trend shows** (decided 2026-10-11, owner's
delegation). Rule, not a list: a category is charted once it has quotations in
**at least two months in one unit and currency** — its most-quoted pair; other
units and currencies are counted and left out, never converted — most-quoted
categories first. An average across categories is never drawn: the RFQ unit is
free text, so a platform-wide mean puts a price per kg beside a price per
tablet. A fixed list would have been wrong on the data: **only 2 of 50**
quotations in the last 12 months are on RFQs that name a category (APIs 1,
Excipients 1) — the rest were raised for "any category", which also widens
which suppliers see them, so requiring a category is a marketplace decision
left open. The panel says exactly that until categorised quotes accrue.
Choosing a category when raising an RFQ is what fills it.

**CI.** Every action GitHub was forcing from Node 20 onto Node 24 now runs a
Node 24 release, pinned by SHA (checkout v7.0.1, cache v6.1.0,
upload-artifact v7.0.2, download-artifact v8.0.2, github-script v9.0.0;
setup-bun v2.2.0 already was). `ubuntu-latest` moves to Ubuntu 26.04 between
2026-10-19 and 2026-11-19: CI can now be dispatched on `ubuntu-26.04` (or back
on `ubuntu-24.04`), and did pass there natively — after the turbo cache was
keyed by runner image, since a shared key let the first trial replay the 24.04
results instead of running anything. The backup → restore-drill pair ran end
to end on the new artifact actions (digest checked; 68 companies, 66 RFQs, 30
orders restored). A route test now covers `/intelligence` and `/finance`,
which no e2e spec visited.

## Examined, not changed

- **Forgot-password says when no account exists** — a deliberate product change
  (2026-09-16); it enables account enumeration. Decision left to the product owner.
- **Moving Anton off the root layout** — the display font is used inside the app
  (order trace card), so the saving did not justify wiring four surfaces.
- **Raw-SQL rewrites of the guard chain / dashboard counts** — after co-location
  each query costs a few ms; the rewrite's risk outweighed its saving.
- **Virus scanning** remains a stub (now backed by file-signature checks).
- **Direct end-labels on the trend charts** — the method wants them for ≤ 4
  series, but these lines converge at zero in real data; the legend carries
  each series' latest value instead, the method's sanctioned fallback.
- **Donut → stacked bar** for the pipeline — five segments with every count and
  share listed beside it stay inside the method's "≤ 6 segments, at a glance".
- **Tinted destructive badges outside the analytical surfaces** (light mode)
  may sit under 4.5:1 like the delta pill did; `text-destructive-accent` is the
  fix wherever one turns up.

## Needs an operator

1. Rotate the production super-admin and demo passwords — the defaults are in
   this public repository and the accounts were found using them.
2. ~~Run `db-migrate`~~ — **done 2026-10-11** (Actions run `38115731801`, approved
   by the owner). The log confirmed `…_expanded_company_types` (2026-09-16) had
   never reached production — registration and RFQ targeting for the nine new
   company types could not work for ~25 days — and applied it with
   `…_lookup_indexes`; status after: "Database schema is up to date". The new
   host-masking step showed the datasource as `***`.
3. ~~Set `PAYMENT_WEBHOOK_SECRET`~~ — **done 2026-10-11** at the owner's request:
   a random 256-bit value, stored as a Sensitive production variable and taken
   up by a fresh deployment. Sandbox card/mobile-money webhooks verify again in
   production, now only with that secret. Its value is not recoverable from
   Vercel; the copy lives with the operator.
4. Make the repository private, or move backups off public artifacts — encrypted
   dumps of production are downloadable by any GitHub user.
5. Longer term: Neon in Europe + `fra1`, a transactional email provider on a
   custom domain, and a staging environment (Neon branch) so the e2e suite stops
   writing to production.

[`a8a96bc`]: https://github.com/ionatech2025/global_pharmachain/commit/a8a96bc
[`30ae9b0`]: https://github.com/ionatech2025/global_pharmachain/commit/30ae9b0
[`af285cc`]: https://github.com/ionatech2025/global_pharmachain/commit/af285cc
[`3741457`]: https://github.com/ionatech2025/global_pharmachain/commit/3741457
[`ec2ba52`]: https://github.com/ionatech2025/global_pharmachain/commit/ec2ba52
[`fbed418`]: https://github.com/ionatech2025/global_pharmachain/commit/fbed418
[`5f16983`]: https://github.com/ionatech2025/global_pharmachain/commit/5f16983
[`28d254e`]: https://github.com/ionatech2025/global_pharmachain/commit/28d254e
[`485ae5a`]: https://github.com/ionatech2025/global_pharmachain/commit/485ae5a
[`911bdf6`]: https://github.com/ionatech2025/global_pharmachain/commit/911bdf6
[`a45e60c`]: https://github.com/ionatech2025/global_pharmachain/commit/a45e60c
[`712ae00`]: https://github.com/ionatech2025/global_pharmachain/commit/712ae00
[`407f7c9`]: https://github.com/ionatech2025/global_pharmachain/commit/407f7c9
