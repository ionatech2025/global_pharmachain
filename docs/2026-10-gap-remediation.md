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

## Examined, not changed

- **Forgot-password says when no account exists** — a deliberate product change
  (2026-09-16); it enables account enumeration. Decision left to the product owner.
- **Moving Anton off the root layout** — the display font is used inside the app
  (order trace card), so the saving did not justify wiring four surfaces.
- **Raw-SQL rewrites of the guard chain / dashboard counts** — after co-location
  each query costs a few ms; the rewrite's risk outweighed its saving.
- **Virus scanning** remains a stub (now backed by file-signature checks).

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
