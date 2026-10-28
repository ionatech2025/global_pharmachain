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

### Release of the audit fixes (2026-10-23)

PR #21 (CI green) merged as `75011da`; no migration, no new environment variables.
`scripts/deploy-vercel.sh` released first time (its fail-closed checks for `sin1`,
`nodejs24.x` and streaming passed) as `ae0evccg4`, now the live alias. Rollback target:
the previous deployment `5fmri7xsy` (see the rollback caveat above).

Verified on the live site, without credentials:

* functions in `sin1`; `/health/ready` ok; the reset-password answer is the new one with
  no `sent` flag; a free-text country is refused with a `400` before any write;
* served CSS carries the new tokens (dark destructive `#d42f34`, light warning `#825200`),
  the logo has a real space, the hero links no longer carry a contradicting `aria-label`;
* **axe-core against production: 15 / 15 page × theme × viewport combinations clean** at
  WCAG 2.2 AA (`/`, `/register`, `/login`, `/forgot-password`, `/disclaimer`; light, dark,
  390 px);
* the public-only browser tests against production: hero fit at four widths, CTA targets,
  the reset page, all nine company types, the API country refusal, and — new — that the
  register form preselects the visitor's country from the CDN's IP header (it showed
  Uganda from Kampala);
* runtime logs for the first 25 minutes: 50 entries, all on the new deployment, 48 × 200
  and 2 × 400 (the deliberate bad-country probes), **0 errors, 0 warnings**.

Two tests assumed no IP header and failed on production for that reason (the product was
right: the CDN's IP outranks the browser timezone). They are now local-only, with a
deployed counterpart.

**Still not verified in production:** everything behind sign-in (the admin company
controls, the in-app disclaimer, the expiry field, the award guard end to end) and the
production e2e run — they need `SEED_DEMO_PASSWORD` and `SEED_SUPER_ADMIN_PASSWORD`.

### Decisions applied (2026-10-23)

The owner asked for the four open decisions to be applied. In order:

**1. Password policy → NIST SP 800-63B-4.** Read from the standard itself
(<https://pages.nist.gov/800-63-4/sp800-63b.html>, §3.1.1.2), not from summaries of it —
which also corrected two things I had from memory (normalisation is NFC, not NFKC; the
blocklist is compared against the *whole* password, never substrings).

| Rule | Before | Now |
| --- | --- | --- |
| Minimum length | 8 | **15** (the floor for a password that may be the only factor) |
| Maximum accepted | 72 | **128** (the standard asks for ≥ 64; Argon2id has no 72-byte limit) |
| Composition | a letter *and* a number | **none** — the standard forbids composition rules |
| Counting | UTF-16 units | **Unicode code points** (an emoji is one character) |
| Normalisation | none | **NFC** before hashing; a hash made from the raw string still verifies |
| Blocklist | none | 16,060 breach-derived entries ≥ 15 characters (SecLists, MIT) + obvious structure (repeats, straight runs), with the **reason** shown; plus a Pwned Passwords range lookup (k-anonymity: only 5 hex characters leave the server) that **fails open** and runs beside the Argon2 hash, so registration does not get slower |
| Rotation | none | none (forbidden by the standard) |
| Paste / managers | allowed | allowed (required) |

Applies when a password is next *set* (registration, invitation, reset, change);
nobody's existing password is invalidated and nobody is signed out. The static list does
not contain the famous xkcd passphrase — the Pwned Passwords lookup does, which is the
point of having both. `PWNED_PASSWORDS_CHECK=false` turns the lookup off.

**2. Passkeys (WebAuthn) for platform admins.** New table `WebAuthnCredential`
(migration `20261023000000_webauthn_credentials`, additive). Enrol under **Account →
Passkeys**; a platform admin who has one **must** present it after their password (or
emailed code) — a TOTP code is not accepted in its place, because it can be phished.
Ordinary users with a passkey may use it or TOTP. Nothing is forced on an account that has
not enrolled, so the release locks nobody out; platform admins see a banner until they
have one. Credentials are discoverable and require user verification, so the sign-in
challenge names no account and reveals nothing about who has a passkey. The passkey must
belong to the user the password identified; challenges are single-use and stored durably
(any serverless instance can verify). Removing one re-asks for the password and emails the
owner; erasing a user deletes their passkeys.
*Proven, not assumed:* five browser tests drive Chromium's virtual authenticator through
real WebAuthn ceremonies, and each of the three protections was **broken on purpose** to
confirm a test catches it (second factor never required; passkey not bound to the user;
challenge never spent). The first version of the challenge test did *not* catch the third —
the signature counter hid it — so it was rewritten to present two different, validly signed
assertions for one challenge.

**3. `middleware` → `proxy`: decided to hold.** Recorded with its trigger in
`docs/runbook-release-and-rollback.md`.

**4. Rollback caveat → runbook.** `docs/runbook-release-and-rollback.md` states the order
(migrate, deploy, verify), how to prove a release is live, and exactly when rolling back is
and is not safe (not once a company is suspended or deleted), with the check an admin can
do in the UI. It also covers passkey operations: the RP ID is bound to the domain (set
`WEBAUTHN_RP_ID` *before* a custom-domain move), register two passkeys, and the recovery
SQL if an admin loses every one.

**Found while doing it:** the dashboard's "audit logs" link was underlined only on hover
(WCAG 1.4.1) — fixed. 27 other `text-primary hover:underline` links exist; most are
standalone, but a sweep of every page for in-sentence ones is worth doing.

## Second edition: pages 12-18 (comments of 2026-10-22 and 2026-10-27)

Source: `COMMENTS ON PHARMACHAIN WEBSITE_CLIENT.docx-1.pdf` (18 pages). Pages 1-11 are
word for word the edition handled above; the new material starts at "The Anonymize
Flow". Branch `fix/client-review-2026-10-27`; spec cases in `e2e/client-review.spec.ts`
under "2026-10-27".

| # | Comment | Verdict | What changed |
| --- | --- | --- | --- |
| 20 | Anonymize: "What does it mean? What does to create a tombstone mean? Why does the admin have to create a new Company Admin in order to anonymize the current company admin?" (data requests and company page) | **Real defect: a dead end**, plus jargon | See "Anonymize" below. |
| 21 | "Force password reset" suggests the admin resets the password behind the user's back; it only sends a link, and the old password keeps working. Rename to "Send Password Reset Link". | Agreed | Renamed. The dialog now says exactly what happens (link valid one hour; current password keeps working until it is used). It also used to claim it "revoked all sessions", which it never did. The admin is now told whether the email actually went out, instead of a blanket "override applied". |
| 22 | Figure 1: choosing a language changes nothing. Build it now or remove it. | **Removed** | See "Language" below. |
| 23 | Figure 2: the notification menu should scroll. | **Real defect** | The menu had `overflow: hidden` and no height limit, so a long list ran off the bottom of the window and could not be reached. It is now capped to the window, the list scrolls between a fixed header and footer, scrolling to the end loads older notifications (also a "Show older" item for keyboard users), and the header has "Mark all read". |
| 24 | Figures 3-4: opening a notification does not lower the count, even after a refresh. | **Three causes**, all fixed | See "Unread count" below. |
| 25 | US-104: the admin was not notified of an expired document; the company was not emailed. | **Both real** | See "Document expiry" below. |
| 26 | Figures 5-6 and the note: after uploading a replacement, admin and company still see "Document expired"; it should say "Waiting re-approval". | **Real defect** | See "Renewal" below. |

### Anonymize (comment 20)

**What it means**, now written into both dialogs in these words: the person's name, email
address, WhatsApp number, password, passkeys, and the IP addresses and devices in their
sign-in history are erased; they are signed out and the account can never sign in again;
the orders, RFQs, documents and payments they took part in are kept, shown as "Deleted
User", because trade records must be retained; the audit log keeps the email address they
acted under as the legal record of who did what. "Tombstone" was developer shorthand for
exactly that — the row stays, its contents are replaced by a placeholder — and no longer
appears in the interface.

**Why it demanded a new Company Admin, and why that was wrong.** Anonymizing a company's
only active Company Admin was refused ("Reassign another Company Admin before anonymizing
this user") so that no company would be left without one. But since the 22 October
change, a platform admin may appoint a Company Admin *only to a company that has none* —
so neither step could go first. Only the person asking to be erased could unblock it, by
promoting someone before leaving. An erasure request has a legal deadline (one month,
GDPR Art. 12(3)); a staffing gap cannot hold it up. The guard is gone: the person is
erased, the company is left without an admin, which is precisely the case the break-glass
"Appoint as Company Admin" exists for. The dialog says so beforehand (and, if they are the
company's only active member, suggests deactivating the company); afterwards the queue's
toast links to the company page. The queue now also shows each requester's company and
role. Anonymizing an already anonymized account is refused with a 409 instead of
re-running.

### Language (comment 22)

The selector saved a preference that only changed how dates and numbers were *written* —
there are no translations — so choosing Français put French dates into English pages
(the "26 oct. 2026" visible in the client's own Figure 2 is that). It also never showed
the saved value: it always read "Browser default". Translating the whole interface into
six languages, including legal and regulatory text, is a project of its own and is not
something to ship half-done, so the selector is removed and dates follow one format. What
did work — the time zone — stays, as **Account → Time zone**, now showing the saved value
and the browser zone it falls back to. The database column and the API field are kept, so
the preference can return with real translations.

### Unread count (comment 24)

1. **The badge stopped at "9+".** Any account with ten or more unread items could open
   one and see nothing change. It now counts to 99.
2. **Daily digests piled up unread.** "Approvals waiting on the platform team" and "GDPR
   SLA breached" are raised every day and restate the whole current state, so each one
   made the previous obsolete — yet all stayed unread. A month of them kept the admin's
   badge pinned. A new digest now marks the earlier unread copies of the same digest as
   read (they stay in the history). The first daily run after release will clear the
   backlog.
3. **The full notifications page did not tell the bell.** Opening an item or pressing
   "Mark all read" there left the bell's cached count until its next 30-second poll. Both
   now update it at once, and the bell itself lowers the badge on the click rather than
   after the request returns.

Measured locally: an admin with 37 unread (35 of them back-dated digests) dropped to 3
after the digest jobs ran; opening one moved the badge 3 → 2 immediately and it read 2
after a reload.

### Document expiry (comment 25)

* **Admin notification.** It existed, but as one anonymous line ("1 company(ies) flagged
  for expired documents") linking to the queue — and with two digests a day arriving
  above it, it fell out of the bell's top eight within days, which is very likely why the
  tester did not see it. It is now one notification **per company, named**, saying which
  document lapsed and when, linking to that company, and **emailed**.
* **Company email.** The 60/30/7-day reminders are emailed; the expiry itself was in-app
  only. The tester's reading was right: a document set to expire the next day passes no
  reminder threshold before the daily sweep (05:00 UTC) finds it already expired, so the
  only message was the in-app one. The expiry notice is now emailed to the company admins
  too, naming the document.
* A lapsed document is now judged on the **current copy of each kind** (newest version),
  as the checklist already did; an older copy that was never formally replaced could
  otherwise keep re-flagging a company the night after it was re-approved.

### Renewal → "Awaiting re-approval" (comment 26)

A company flagged for an expired document stayed `EXPIRED_DOCUMENT` after uploading the
renewal, so everyone kept seeing "Document expired" until an admin happened to look. It
now behaves like a rejected company's re-upload already did: once the upload leaves
nothing expired or missing, the company goes back to the verification queue
(`PENDING_VERIFICATION`, audited as `company.verification-renewal`), the platform admins
are notified and emailed ("… renewal awaiting re-approval"), and the company is told its
renewal was received. It stays unverified — marketplace actions still wait for an admin
— but because it was verified before, every label reads **"Awaiting re-approval"**: the
app-shell banner and sidebar, the company's profile and checklist page, the admin queue
(it moves from "Expired docs" to "Pending") and company page. No new database status, so
no migration. The checklist page also explains, while a document is expired, that
replacing it is all that is needed.

Companies that had already uploaded a renewal before this release (the client's Breston
Technologies) are picked up by the next daily sweep, which returns any flagged company
whose renewal is complete to the queue. Three-year re-verification flags are left alone
by the sweep; those wait for the company to refresh a document.

### Verification (2026-10-28)

* Unit: core 131, API 96, email 31. New: the renewal label, and the current-copy rule
  for lapsed documents (including a renewal whose old copy was never superseded).
* Typecheck 9/9, lint clean.
* **Expiry and renewal, end to end on a local stack** (real PostgreSQL, the real job and
  upload code, a stand-in S3 store): backdating Nile Pharma's trading licence and running
  the job flagged the company, raised a named notification for its admin and for the
  platform admin, and queued an email to each (console mail provider). Replacing the
  licence through the UI turned "Document expired" into "Awaiting re-approval" in the
  banner, badge, checklist and profile; the admin queue showed Nile under Pending as
  "Awaiting re-approval" and not under Expired docs; approving made it Verified.
* The daily sweep, run against the pre-fix state (flagged, renewal already in): the
  company was returned to the queue; a company flagged by the three-year rule with valid
  documents was left flagged, as intended.
* Digests: 35 back-dated unread "Approvals waiting" digests plus a fresh one → after two
  runs of each digest job, one unread digest remained.
* `e2e/client-review.spec.ts`: five new cases — the reset-link wording and dialog; a
  company's only admin erased from the data-requests queue (warning shown, no "tombstone",
  toast names the admin-less company, a second attempt is a 409, the company is then
  archived); the bell badge lowering on the click and after a reload; the menu staying
  inside a 640 px window and loading older items on scroll; the language picker gone and
  the time zone round-tripping. The whole file: 34 passed, 1 skipped (deployed-only).
* Full local suite: **95 passed, 15 skipped, 1 failed** — the failure is epic2 case 21,
  which waits for a real invitation email (no mail relay locally). The document-upload
  case that always failed locally now passes, because the run used a stand-in S3 store.

No schema change and no new environment variable: this release needs no `db-migrate` run.

### Audit of the second-edition release (2026-10-28)

Re-checked against the code, a real database, the live site, and current guidance —
the EDPB's report on its 2025 coordinated action on the right to erasure (adopted
February 2026), the GitHub advisory database, TanStack Query's documented refetch
behaviour, and axe-core 4.14 at WCAG 2.2 AA. It found five things worth fixing.

| # | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| A1 | **Erasure left personal data behind.** The authenticator-app secret, push-device subscriptions (endpoint + user agent), the driver's licence number, live password-reset tokens, the person's own notifications, saved searches, settings and queued messages to their address all survived. The EDPB report (§4.2.7) names masking-instead-of-deletion as a recurring failure. | Code: the erasure touched none of those tables or columns. After the fix, a local erasure seeded with each of them left none behind. | All deleted or cleared inside the erasure transaction; what is kept (trade records, order messages, the audit log, Art. 17(3)(b)/(e)) is unchanged and now stated. The visible action is renamed **"Erase personal data"**: since the audit log keeps the address, "anonymize" overstated it. |
| A2 | **The person was never told.** No acknowledgement of the request and no confirmation of the outcome — the EDPB's "insufficient information" issue (§4.2.3; Art. 12(3)-(4)). | Code. | On request: an email and in-app notice with the date it will be done (one month). On completion: an email stating what was erased, what was kept and why, and the right to complain to a supervisory authority — sent straight to the address being erased, not through the outbox, and not logged. The privacy notice now says the same, with the retention period. |
| A3 | **Approval and the nightly flag disagreed.** The sweep flags a company for any lapsed expiry-enforced document; approval checked only the mandatory ones, so a company with a lapsed *optional* import/export licence could be approved and re-flagged that night. Reactivation had the same gap. | Code: `decideVerification` consulted only the mandatory checklist. After the fix, approval is refused locally with "Import/Export Licence (expired)" and succeeds once it is renewed. | Approval, reactivation and the sweep apply one test. The admin's check list shows the lapsed optional document, pointing at the right copy. |
| A4 | **Zod advisory GHSA-mrhx-c7xc-m3w5 (high, CVSS 7.5).** Zod ≤ 4.6.5 accumulates an issue per failing array element without limit — a large array can exhaust memory. The API validates every request body with Zod; the installed copy was 4.4.3, plus a nested 4.1.11. | `bun audit`; advisory published 2026-10-01. | Zod 4.6.7, forced through `overrides`; a clean install leaves one copy on disk. Remaining advisories: the same two build-time-only ones as before. |
| A5 | **The bell kept refetching every page it had loaded.** An infinite query refetches all held pages on each poll (TanStack Query docs), and the bell is mounted on every signed-in page. The first fix (trim to page 1 on close) was undone by the closing animation, whose still-visible sentinel fetched page 2 again. | Request count after loading 4 pages and closing: 2-3 list requests a minute. | Trim on close, and load-more only while open: measured **1 request a minute, page 1 only**. |
| A6 | Dark mode: the red "Erase personal data" menu item failed contrast (WCAG 1.4.3). Pre-existing — the old "Anonymize" item had the same style — because the menu's variant class bypassed the dark-mode override for `text-destructive`. | axe-core, dark, 1360 and 390 px. | Menu items use the text-safe `destructive-accent` token (fixes "Sign out" too). |

**Checked and fine:** Next.js 16.4.2 is past the 14 October 2026 fixes (16.4.1); 16.4.3 is
a bug-fix backport with no security content, so not taken. Erasure is idempotent (a
second attempt is a 409) and serializable. Notification deletions touch only tables
nothing else references.

**Verification:** unit tests (core 131, API 96, email 31); typecheck 9/9; lint clean;
axe-core 4.14 **clean on 36 combinations** (bell menu, member menu, both erase dialogs,
data requests, account, verification, notifications and privacy pages; light and dark;
1360 and 390 px); local scripts proving A1-A3 against a real database; the client-review
spec 34 passed / 1 skipped. Full local suite: **96 passed, 14 skipped, 1 failed** (epic2 case 21,
which waits for a real invitation email — no mail relay locally). An earlier full run
failed 16: the audit's own sign-ins had used up the login throttle (40 per 15 minutes per
IP; the throttle table showed the bucket at 41, blocked); cleared, the same tests passed. **On the live site** as the Nile Pharma company admin: the
menu stays inside a 640 px window and scrolls; opening an item lowered the server's
count 323 → 322 and it stayed lowered after a reload (the badge reads "99+" at that
level, as designed — the demo account's backlog is e2e residue); no language picker;
production logs since the release: 50 entries, all 200, no errors.

**Production limit:** the platform admin now signs in with a passkey, so nothing behind
the admin sign-in can be exercised from here — the admin specs fail at `/login` by
design. The company-side checks above were run instead.

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
