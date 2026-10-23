# Client review of 2026-10-20/22 — findings, fixes and verification

Source: `COMMENTS ON PHARMACHAIN WEBSITE_CLIENT.docx.pdf` (12 pages, screenshots
dated up to 2026-10-22). The first half repeats the earlier brief (Mall
Directory, three-button hero, tokens → utility, legal disclaimer, company types,
country dropdown, footer contact); the second half is new. Every comment was
re-checked against the **code as it stands**, not against the commit log, and
each fix was run — unit tests, a real PostgreSQL, a production build, and a
Playwright spec (`e2e/client-review.spec.ts`, 20 cases) written so that a
regression names the comment it undoes.

## Comment → outcome

| # | Comment | Verdict | What changed |
| --- | --- | --- | --- |
| 1–4 | Mall Directory grid, 3-button hero, utility-not-tokens narrative, headline | Already shipped (2026-09-16) | Audited. One real inconsistency found: "Source raw materials" registered a *buyer* from the hero but a *seller* from the directory. All three entry points now come from one module (`lib/lane-links.ts`). |
| 5 | Legal disclaimer "on the platform" | Partly done | It lived on the landing page and `/disclaimer` only. Now also a standing notice in the signed-in app shell (where trading happens) and the auth footer. Brand spelling normalised to "Global PharmaChain". |
| 6 | RFQ attachments: URS or drawings | Already shipped | Verified. |
| 7 | Nine extra company types | Already shipped | Verified in the register form, admin onboarding and enum (e2e checks all nine). |
| 8 | Country: dropdown / auto-pick | Shipped, **with two defects** | (a) Unmapped timezone silently defaulted to **Uganda** — a wrong country on a regulatory registration. (b) The API accepted any free text. Now: IP country (Vercel header, resolved server-side) → timezone → **empty and asking**; API validates against the list. |
| 8b | Raw "Too small: expected string to have >=2 characters" | **Still present** on four other fields | App-wide human wording for zod's stock length/required messages (`zod-messages.ts`), so web forms *and* API error bodies read as words. |
| 9 | "Global PharmaChain?" | Fixed | Sign-in link, error/empty states, privacy, emails (subjects, header, footer), PWA name. WhatsApp/SMS keep the short "PharmaChain:" prefix. |
| 10 | Onboarding slow | Investigated — see below | Registration made one nested create (no BEGIN/COMMIT round trips, no re-read). The remaining cost is geography; one decision is left to the owner. |
| 11 | "QA All-Users MSX55OUE — visible to everyone?" | Answered, no code | Not test residue from the suite (the string is not in git). It is an announcement a tester created in Platform admin → Announcements with audience **All users**, so it is visible to everyone by definition. Retract it there. Left untouched in production. |
| 12 | Unfilled countries/certifications must not look filled | Verified | Placeholders read "e.g. … (optional)" and the public profile renders nothing for an empty list. |
| 13 | Reset link must not be sent to a non-existent account | **Reverted a 2026-09-16 change** | See "Reset password" below. |
| 14 | Footer email & contact | Done, **needs real details** | See "Needs the client". |
| 15 | Hero button text not aligned | Fixed | `Button` is `whitespace-nowrap`; the labels clipped in ~250px tiles. Labels wrap, tiles share a height. Checked at 1440/1024/768/390px. |
| 16 | System slow; monorepo on Vercel? | Answered below | |
| 17 | US-104: expiry only on the TIN? | Answered + fixed | The expiry *engine* was already generic (any document with an `expiresAt`). The *form* only offered a date for four licences + GMP, so a TIN, incorporation certificate or "other" could never carry one. Every verification document now accepts an optional date; licences still require one; a lapsed date is refused. |
| 18 | Dropdown options invisible in dark mode (3 screenshots) | Fixed (second occurrence) | See below. |
| 19 | Platform admin menu: Operations/Finance staff; add delete | Done | See below. |

## Dropdown visibility (comment 18)

Reported on 2026-08-19 and again on 2026-10-22, so the first fix did not reach
the cause. The app has 35 native `<select>`s, all `bg-transparent`. Chromium on
Windows/Linux (Chrome, Edge, **Opera**, the client's browser) cannot paint a
transparent option row — it falls back to white — while the text stays the dark
theme's near-white: white on white. `color-scheme` (the first fix) does not help
because the transparent background wins.

Fix: one rule in `globals.css` giving every `option`/`optgroup` the opaque
popover tokens. Measured on the real pages, both themes: dark → option
`lab(4.05)` on text `lab(98.3)`; light → `lab(100)` on `lab(2.75)`. With the
old transparent option, the same probe returns `rgba(0,0,0,0)` — the test
fails on the old behaviour. **Not verified:** the OS-painted popup itself (no
display server on the test machine); the client should confirm in Opera.
`appearance: base-select` was rejected: Chromium-only, not Baseline.

## Reset password (comment 13)

The original screen said "If an account exists … a reset link is on its way";
the client read that as a link being sent to an unknown address. It never was —
the code returned early. Commit `4ed108c` took the comment literally and made
the endpoint answer "No active account found", which **leaks which emails are
registered** (OWASP Forgot Password cheat sheet: same message *and* same
response time for existing and non-existing accounts).

Now: identical answer for every address, all work (lookup, token, mail) after the
response, a 60 s per-account cooldown against mail-bombing, and copy that answers
the client's real question — "No email is sent to addresses that are not
registered." Also dropped the `!passwordHash` exclusion: bulk-onboarded clients
(active, no password yet) could not recover once their 7-day setup link lapsed.
Verified: six requests each for a known and an unknown address → identical
bodies, medians 15 ms vs 12 ms, and the database holds **one** token for the
known account and none for the stranger.

## Platform admin: company access (comment 19)

* **Role menu.** "Make Operations/Finance Staff" removed — roles inside a company
  are its own admins' decision. The one thing the platform keeps is break-glass:
  *Appoint as Company Admin*, offered only when the company has none (the
  US-203 / e2e case 28 scenario). Enforced in the API, not only the UI.
* **Deactivate / Reactivate / Delete company** (new `SUSPENDED`, `DELETED`
  statuses; migration `20261022000000_company_suspension`).
  * *Deactivate* is reversible: members are signed out at once (session version
    bump), refused at sign-in *after* a correct password (so nothing is confirmed
    to a guesser), blocked at the membership guard and for API keys; everything
    gated on `VERIFIED` (listings, directory, RFQ reach) drops out for free.
    Reactivation returns to Verified only if it was verified before and its
    documents still pass — otherwise the verification queue.
  * *Delete* is a second, deliberate step: the company must already be
    deactivated, the admin types its name, a reason is audited, and it is
    **refused while orders are undelivered, disputes open or payments pending**.
    Rows are not removed — EU GDP requires transaction records to be kept for at
    least five years and every order/document/audit entry hangs off the company
    (23 relations, none cascading). What is erased is everything personal:
    members anonymised (same code path as the GDPR override, now shared), primary
    contact tombstoned, API keys/invitations revoked, webhooks disabled, listings
    withdrawn. The registration number stays reserved; the member email is freed.
* The controller carried a hard-coded copy of the status list that would have
  rejected the new filter tabs; it now derives from the shared enum.

## Performance (comments 10 and 16)

"Could it be because backend and frontend are one monorepo on Vercel?" — **no.**
A monorepo is a source layout; Vercel deploys what is built. What matters is
topology, and it was measured, not assumed:

* Server time is not the cost. API logs (`durationMs`): 4–23 ms per request;
  database round trip 0–27 ms since every function was pinned to `sin1` beside
  Neon on 2026-10-11 (it was ~240 ms per query when functions ran in `iad1`).
* What remains is **distance plus per-request work**: Uganda → Singapore is
  hundreds of ms per round trip, and a sign-in or registration is several
  sequential trips (page, JS, CSRF, credentials, redirect, dashboard). Each
  browser API call is also two function hops (web proxy → API function).
  Measured from Kampala this session: `/register` TTFB 0.9–2.6 s, bare
  `/health` 0.7–1.4 s (this machine's link is lossy; the logs are the
  authority).
* Auth pages are rendered per request and uncached, because the per-request CSP
  nonce makes them dynamic. They hold no per-user data, so they *could* be static
  and CDN-cached (landing page: ~300 ms TTFB). That trades the nonce CSP on the
  sign-in/registration forms for hash/SRI-based CSP — a security decision for the
  owner, deliberately **not** made here.
* Done: registration is one nested create (atomic, fewer round trips).
* Highest-impact remaining lever, unchanged from 2026-10-11: Neon in Europe
  (`eu-central`) and `fra1`, closer to East Africa than Singapore. Needs a new
  Neon project and a data migration.

## Verification

* Unit: core 116, API 75, email 30 — all pass. New: reset-link cooldown/message,
  expiry rules, country detection (every ISO alias resolves to a real list entry),
  friendly zod messages.
* Real database: all 15 migrations apply from empty including the new one;
  `prisma migrate diff` against the schema is empty (no drift).
* `e2e/client-review.spec.ts`: 20 cases — hero fit at four widths, CTA targets,
  option contrast in both themes (theme asserted applied), reset-password
  indistinguishability, country behaviour, all nine company types, in-app
  disclaimer, expiry field, member menu, API role enforcement, the full
  deactivate → sign-in refused → reactivate → delete → archived → address reusable
  sequence, and deletion refused with orders in flight (local stack only — it
  suspends a seeded company for a moment).
* Two bugs the spec caught in this very change: the email-subject brand rename had
  missed two backtick-prefixed lines, and the admin status filter would have
  rejected the new statuses.

## Release (2026-10-22)

Order mattered and was followed: **migrate, then deploy.**

1. `db-migrate` run `39838307030` on this branch: *before* — one pending migration
   (`20261022000000_company_suspension`; the Oct 15 support migration was already
   applied and is idempotent anyway); *after* — applied, host masked.
2. `scripts/deploy-vercel.sh` from this branch (PR #20, CI `verify` green). Two
   attempts died on the known transient `fetch failed`; the third released, with the
   script's own fail-closed checks (`sin1`, `nodejs24.x`, streaming) passing.
3. Verified live without credentials: functions in `sin1`, `/health/ready` ok; the new
   reset-password answer is served (no `sent` flag); a free-text country is refused with
   a 400 before any write; the new hero labels and the `select option` rule are in the
   served HTML/CSS; no `localhost` in the output.

**Not yet verified in production:** anything behind sign-in (the admin
Deactivate/Delete controls, the in-app disclaimer, the expiry field) and the
production e2e run, because both need `SEED_DEMO_PASSWORD` and
`SEED_SUPER_ADMIN_PASSWORD`. Run
`E2E_BASE_URL=https://global-pharmachain.vercel.app SEED_DEMO_PASSWORD=… SEED_SUPER_ADMIN_PASSWORD=… bun run test:e2e --retries=1`.
Note the new spec's lifecycle case registers and then archives one company
(`Review Lifecycle … Ltd`), and its last case is skipped on deployed targets.

## Audit follow-up (2026-10-23)

A second pass, aimed at the release itself rather than the client's list: read the
changed code for failure modes, run it against a real database, measure, and check it
against current standards. It found real defects — one of them live in production.

| # | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| 1 | **A buyer could award an order to a suspended supplier.** `acceptQuotation` never looked at the supplier's status, so a quotation outlived its author's standing. | Reproduced on the *released* code: accept returned `201`, not `409`. | Award requires the supplier to be `VERIFIED` (the same rule already applied to quoting). The new test fails on the old code. |
| 2 | Suspension cut sign-in but **not data egress**: webhooks kept queueing and being delivered, and notifications kept going to the suspended company's members. | DB probe: 0 deliveries / 0 notifications while suspended, 1 / 1 when verified. | Both paths now exclude `SUSPENDED`/`DELETED` companies, including already-queued deliveries. |
| 3 | An invitation to a suspended company could still be **accepted** (it builds a session without passing through `login()`). | DB probe: `403` while suspended, `200` once reinstated. | Refused for blocked companies. |
| 4 | Deleting a company read its members and checked its obligations *outside* the transaction; transitions were unconditional. A late joiner or a concurrent reactivate could leave a half-erased company. | Reading the code; see "limits" below. | Member list, obligations and the status change now happen in one serializable transaction with compare-and-set updates. Obligations also count open invoices and appointed logistics partners (a deleted forwarder would have stranded a shipment). |
| 5 | Dashboard / analytics "Companies" totals counted deleted companies. | Code. | Excluded. |
| 6 | **57 dependency advisories (5 critical, 30 high).** Next.js 16.2.10 was inside the range of all five critical RCEs; the API served with a nested Fastify 5.11.3 (auth/validation bypass advisories). | `bun audit` | Next 16.4.2, Fastify 5.12.7 (forced through `overrides`: `@nestjs/platform-fastify` carries its own nested copy), `@nestjs/*` 11.2.7, nodemailer 10.2.1, fast-uri, nanoid, postcss, source-map-js. **57 → 2**, both build-time only (the Prisma CLI's `deepmerge-ts`, and `baseline-browser-mapping`). Exposure was probably low (no `next/og`, no `"use cache"`, no image config, Linux host) but "probably" is not a standard. |
| 7 | **WCAG 2.2 AA failures** (axe-core, light + dark + 390px): hero tiles 3.3–4.0:1; announcement badge 4.09:1; dark destructive badge 4.38:1; light warning badge 4.01:1; avatar initials 3.9:1; and *Label in Name* (Level A) failing on the logo (no space between "Global" and "PharmaChain"), the hero links, the search / report-issue / notifications buttons. | axe-core 4.14.0 with `wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa` | All fixed; colours chosen by computed ratio, not by eye. Also `autocomplete` on three fields (1.3.5). |
| 8 | My own new specs registered so many companies they exhausted the 10/hour registration throttle and broke the *existing* register test. | 429s in the suite. | Shared `registerCompany` helper pinning a client IP, as `regression.spec.ts` does. |

**Checked and fine:** security headers on the landing page, a dynamic page and the API
(HSTS preload, nonce CSP, `nosniff`, COOP, Permissions-Policy); `security.txt` is valid
(`Expires` 2027-10-11, RFC 9116); credential fields carry the right `autocomplete` and do
not block paste (WCAG 3.3.8); unique-constraint and serialization races map to a clean
`409`; `Company.verificationStatus` is already indexed.

**Page weight** (cold cache, production build, gzip): landing 156 KB JS, login 208 KB,
forgot-password 204 KB, register 276 KB (the form library, resolver and select widget);
CSS 21 KB and fonts 63 KB everywhere. Nothing needs splitting; `register` is the one to
watch. Server time is 4–23 ms (see Performance above); what users feel is distance.

**Verification after the changes:** unit 116 + 75 + 30; typecheck 9/9; lint clean; full
local suite **80 passed**, the same two cases failing as before for local-environment
reasons only (no object store, no mail relay); axe clean at WCAG 2.2 AA on every public
page and every page the release touched.

**Limits of what was proven.** The two concurrency tests also pass against the old code
on this machine: queries here take ~1 ms, so the read-then-write window never opens. The
compare-and-set is correct by construction and the tests guard the invariant, but only the
award test (finding 1) was seen to fail before the fix. The OS-painted dropdown popup,
and everything behind sign-in in production, remain unverified from here.

**Not changed — decisions for the owner:**
* **Password policy** (`US-206`: ≥ 8 characters, a letter and a number). NIST SP 800-63B-4
  moves away from composition rules and towards length (secondary sources say ≥ 15 when
  a password is the only factor, and ≥ 64 accepted); the API already hashes with Argon2id
  so it could allow it. This is the client's written requirement, so it is theirs to change.
* **Next.js 16 deprecates `middleware` for `proxy`**, which defaults to the Node.js
  runtime. Migrating would move the landing-page redirect from the edge into a function
  pinned to `sin1` — slower for every visit to `/`. Keep `middleware` until that is
  measured.
* **Phishing-resistant MFA.** TOTP exists; for a platform that can suspend and delete
  companies, passkeys/WebAuthn for platform admins are the next step.
* **Rollback caveat.** Rolling production back to a build from before 2026-10-22 is only
  safe while no company is `SUSPENDED` or `DELETED`: the older Prisma client cannot read
  those enum values and will fail on the row. After that, fix forward.

## Needs the client / the operator

1. **Contact details.** `contact@globalpharmachain.com` is printed in the footer,
   legal page and `security.txt`, but the domain has an A record and **no MX
   records**, so senders fall back to the web host's A record. Whether that host
   accepts mail could not be confirmed from the test machine (outbound port 25 is
   blocked), so treat the mailbox as unverified. The phone `+256 700 000 000` is an
   obvious placeholder. Both are now `NEXT_PUBLIC_CONTACT_EMAIL` /
   `NEXT_PUBLIC_CONTACT_PHONES`; real values are needed (a release applies them).
2. **Run `db-migrate` before releasing.** The migration only adds two enum values
   (additive, cannot be undone in PostgreSQL). Releasing first would 500 the admin
   companies list, which now compares against `DELETED`.
3. Confirm the dropdowns in Opera (see above).
4. Decide on static, cached auth pages vs the nonce CSP (performance section).
5. Retract the tester's "QA All-Users" announcement; consider whether the bulk-CSV
   importer should also reject countries outside the list (it still accepts free
   text).

## Sources

* OWASP, *Forgot Password Cheat Sheet* — consistent message and response time:
  <https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html>
* OWASP, *Password Storage Cheat Sheet* — Argon2id baseline (the API already uses it):
  <https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html>
* Vercel, request headers (`x-vercel-ip-country`, ISO 3166-1; VPN/proxy caveat):
  <https://vercel.com/docs/headers/request-headers>
* Vercel, choosing deployment regions (run functions beside the data):
  <https://vercel.com/guides/choosing-deployment-regions>
* EU *Guidelines on Good Distribution Practice* 2013/C 343/01 — records kept at
  least five years (national law may require longer):
  <https://gmp-compliance.org/guidelines/gmp-guideline/guidelines-of-5-november-2013-on-good-distribution-practice-of-medicinal-products-for-human-use-2013-c-343-01>
* MHRA GMP certificate templates — validity is anchored to the inspection date
  and a three-year reliance window, not a fixed term:
  <https://cms.mhra.gov.uk/index.php/print/pdf/node/92816>
* MDN / Chrome, customizable `<select>` (`appearance: base-select`) — Chromium
  only, hence not used: <https://developer.chrome.com/blog/a-customizable-select>
* NIST SP 800-63B-4 (Aug 2025) — secondary summary: <https://www.enzoic.com/blog/nist-sp-800-63b-rev4/>;
  read the publication itself before changing policy.
* WCAG 2.2 — 2.5.3 Label in Name, 2.5.8 Target Size, 3.3.8 Accessible Authentication:
  <https://www.w3.org/TR/WCAG22/>
* web.dev Core Web Vitals thresholds (LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 at p75):
  <https://web.dev/articles/defining-core-web-vitals-thresholds>
* Next.js 16 `middleware` → `proxy`: <https://nextjs.org/docs/app/api-reference/functions/middleware>
* RFC 9116 (`security.txt`): <https://www.rfc-editor.org/rfc/rfc9116>
