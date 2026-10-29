# RFQ delivery audit — updates, freshness and real-time notification (2026-10-29)

Scope, as asked: what happens to an RFQ **after it is generated** — whether it reaches
the suppliers who can answer it, whether what they and the buyer see stays current, and
whether changes are notified as they happen. Audited against the code and a real
PostgreSQL, and against procurement law rather than summaries of it.

**Standards used** (read in the original):

* UNCITRAL Model Law on Procurement of Goods, Construction and Services (the 1994 text;
  its 2011 revision keeps the same duties, renumbered as arts. 14-15):
  * art. 28(2) — an addendum "shall be communicated promptly to **all** suppliers or
    contractors to which the procuring entity has provided the solicitation documents";
  * art. 30(1) — the entity "shall fix … a **specific date and time** as the deadline";
  * art. 30(2)-(4) — extend the deadline when a modification needs it, and give "notice
    of any extension … promptly to **each** supplier";
  * art. 30(5)(c) — "a receipt showing the **date and time** when its tender was received".
* GitHub Actions documentation — scheduled runs "can be delayed during periods of high
  load"; queued jobs may be dropped. (Our 10-minute jobs run there.)
* Vercel functions documentation — streaming responses (SSE) on Node with Fluid compute,
  bounded by the function's maximum duration.

## Findings

| # | Gap | Severity | Evidence | Fix |
| --- | --- | --- | --- | --- |
| G1 | **A new RFQ reached no supplier.** `createRfq` notified nobody; suppliers found an RFQ only by opening their inbox, while its deadline ran. Saved-search alerts cover catalogue listings, not RFQs; the only RFQ webhook fired at award. And nothing recorded who an RFQ had been provided to, so art. 28(2)/30(4) could not be met even in principle. | Critical | Code. | **Delivery with a recipient record** (`RfqDistribution`): on publication every eligible supplier (the inbox rule exactly) gets a row, then an in-app notice, an email and WhatsApp (opt-out per channel: new preference "New RFQs your company can quote on"), and an `rfq.published` webhook. Each row is claimed with a compare-and-set lease and stamped delivered only after the send succeeds — two attempts never both send, a crash in between is retried, not lost (at-least-once). The request path delivers at once; the new `rfq-distribution` job (frequent tier, plus an in-process cron) finishes anything it could not. |
| G2 | **The deadline was a date, stored as 23:59 UTC, shown as a date.** In Kampala (UTC+3) a deadline the buyer picked as "5 November" displayed as **6 November** and closed at 02:59 that morning — a supplier would reasonably believe they had the whole of the 6th. Art. 30(1) asks for a date and a time. | High | Unit test reproduces the old value: `5 Nov 23:59 UTC` → "6 Nov 2026, 02:59 GMT+3". | The form takes a **date and time in the buyer's own zone** (default 23:59 local, not UTC). Every display — RFQ page, inbox, My RFQs — shows date, time and zone; notices and emails state it as "5 Nov 2026, 23:59 GMT+3 (20:59 UTC)". |
| G3 | **State writes did not re-check state.** Cancel read the RFQ, checked, then wrote unconditionally — a cancel racing an award could turn an AWARDED RFQ, with its order, into CANCELLED. Auto-close selected due RFQs then updated by id only — one awarded or cancelled in between was overwritten to CLOSED, and its buyer told it had closed. (Award was already conditional.) | High | Code; the windows are milliseconds, so not reproducible locally (~1 ms queries). | Both conditional on the status they expect; auto-close announces only what it actually moved; a second cancel is a 409. |
| G4 | **"Open" after the deadline.** Closing at the deadline is a scheduled job, and scheduled jobs run late (GitHub's own documentation); until it ran, the buyer's pages said Open. | High | Code + GitHub docs. | Every read returns the **effective status** (`effectiveRfqStatus`): past its deadline an RFQ reads CLOSED whether or not the job has run. |
| G5 | **Pages never updated by themselves.** The buyer's RFQ page and the supplier's quote inbox were server-rendered snapshots; a supplier typing a quotation learned of a cancellation only when the submit failed. Worse, the buyer's quotation table copied its data into component state at first render, so even a refresh did not show a new quotation. | High | Code. | **Live change feeds (SSE)** for the RFQ page and the inbox, on the pattern the message threads already use: the stream only says "changed", the page re-reads through its normal path, client state (a half-typed quote) survives. Visible tabs only; reconnects resume from the last event id; a slow poll while the stream is down. The quotation table is derived from fresh data on every render. A supplier's feed watches only its own quotation, so it never reveals that competitors quoted (US-406). |
| G6 | **Cancellation reached only suppliers that had quoted.** Those still preparing a response were never told (art. 30(4)). | Medium | Code. | Cancellation, like every change, goes to the RFQ's whole **audience**: everyone it was delivered to plus anyone who quoted, by in-app notice, email, WhatsApp and `rfq.cancelled` webhook. |
| G7 | **No addendum or deadline extension** (arts. 28(2), 30(2)-(4)). | Medium | Code. | **Amend / extend deadline** for the buyer while the RFQ is open: a dated, kept addendum (`RfqAmendment`), optionally with a later deadline — never an earlier one (that would take time from suppliers already preparing). Compare-and-set on the deadline; sent to the whole audience with `rfq.amended`; shown as a numbered history on the RFQ page to both sides. |
| G8 | **No receipt** for a quotation (art. 30(5)(c)). | Medium | Code. | Every submission and resubmission sends the submitter a receipt — reference, version, total, **the date and time received**, and until when it can be replaced. Not opt-out-able: it is their record. `quotation.received` webhook to the buyer. |
| G9 | **No RFQ webhooks** for either side's own systems. | Low | Code. | `rfq.published`, `rfq.amended`, `rfq.cancelled`, `quotation.received`. |

Also found while doing it: a supplier the RFQ was delivered to lost access to it if it
stopped matching later (a listing unpublished) — it was given the solicitation, so its
addenda and outcome remain its business. It keeps access now.

## Phases

1. **Correctness and delivery** — G1, G2, G3, G4, G6, G8, G9.
2. **Real time** — G5.
3. **Amendments** — G7.

One migration (`20261029000000_rfq_delivery`, additive): two notification types, the
`distributedAt` column, `RfqDistribution`, `RfqAmendment`. It **backfills `distributedAt`
for every existing RFQ** — without that, the first delivery sweep after release would
announce every historical RFQ to every supplier at once.

## Design notes

* **Why a polled fingerprint, not push.** The API is serverless functions with no shared
  memory or broker between instances, and Neon's pooled connections cannot hold `LISTEN`.
  Each open, visible tab costs one cheap indexed read every 3 s; streams end at ~55 s,
  inside every function limit. A fresh stream announces its baseline as an event so the
  browser always holds an id to resume from, and the page refreshes once on its first
  baseline — without that, a change between the server render and the stream's first read
  was lost (the new spec caught exactly this).
* **Why at-least-once.** A duplicate "new RFQ" notice is harmless; a missed one is a
  fairness problem in a procurement. Notices are sent before a row is stamped delivered,
  through a `notify` variant that throws (the normal one swallows errors by design).
* **Webhooks ride the existing signed, retried delivery** (and stop for suspended companies).

## Verification

* Unit: core 139, API 101, email 31 — new: deadline wording (including the old Kampala
  off-by-a-day value), effective status, amendment rules, the change feed (baseline,
  change, resume after a missed change, quiet resume, a failed read).
* Migration: applied to a real PostgreSQL; `prisma migrate diff` from the migrations to
  the schema is empty (no drift); the backfill left 0 of 7 existing RFQs undelivered.
* `e2e/rfq-delivery.spec.ts` (local stack, 5 cases, serial): a new RFQ appears in the
  supplier's **already open** inbox without a reload and their notice states date, time
  and zone; the RFQ page shows the deadline's time; a quotation appears on the buyer's
  open page without a reload and the supplier's receipt carries the time received; a
  shortened deadline is refused and an extension reaches the supplier, with the history
  shown; a cancellation reaches a supplier that never quoted, and a second cancel is 409.
* The golden-path spec fills a date and time now (the field changed on purpose).

## Not done here — needs the client's decision

1. **Clarification questions** (art. 28(1)): suppliers ask, the buyer answers, and the
   answer goes to every supplier *without naming who asked*. A new workflow and data model;
   worth doing, but its rules (cut-off before the deadline, moderation) are the client's.
2. **Sealed quotations.** Today the buyer sees each quotation as it arrives. In public
   tendering, tenders stay sealed until the deadline (art. 30(5)(a): "sealed envelope";
   opening under art. 33) — early visibility is the classic opening for bid-rigging. It
   changes the product (no early award), so it should be a per-RFQ or per-tenant choice.
3. **Real-time beyond RFQ pages.** The notification bell still polls every 30 s (it now
   updates at once whenever an RFQ page's feed fires). A platform-wide stream would cost a
   held function per open tab; push (VAPID) already exists but is not configured on the
   deployment.

## Release (2026-10-29)

Migrate first, then deploy — the new code selects `Rfq.distributedAt`, and every RFQ read
would 500 on a database without it. Done in that order:

1. PR #26 merged (`2e05943`), CI `verify` green.
2. `db-migrate` run 40927574234 on `main`: before — one pending
   (`20261029000000_rfq_delivery`); after — "Database schema is up to date". The live
   (old) code was then checked against the migrated database: RFQ list and detail, supplier
   inbox and notifications all 200.
3. `scripts/deploy-vercel.sh` → `nkab9gtgy` (fourth attempt; the first three were this
   machine's transient `fetch failed`). Rollback target: `4yvviumul`.
4. Verified with the Vercel CLI: Ready, all four aliases, functions in `sin1`; the served
   chunk carries the amendment dialog on both domains; an unauthenticated amend and an
   unauthenticated inbox stream are refused with 401 (the stream before it opens);
   runtime logs 50/50 × 200.

**Test RFQs on production now reach real suppliers unless aimed.** A production RFQ for
the demo supplier's type reached 3 verified companies; `quietRfqTarget` aims the suite's
RFQs at a category only the demo supplier lists in (reach 1, checked at run time) and
skips when none exists.

## Found during the release: the frequent jobs barely run

`jobs-frequent.yml` is scheduled every 10 minutes (144 runs a day). GitHub ran it **3–7
times a day** over the last eight days (60 of 60 runs inspected, all `schedule`) — about 4%,
consistent with GitHub's documented best-effort scheduling, but far worse than its "can be
delayed" suggests. Every frequent-tier job inherits that: **email/WhatsApp outbox retries,
webhook retries, quotation expiry, token cleanup, RFQ auto-close, and the new
rfq-distribution safety net.** This release does not depend on that clock for correctness
(effective status at read; delivery in the request path), but retries do.

Vercel Cron would be the natural fix (it sends `CRON_SECRET` as the bearer token the
dispatcher already checks, and the variable is set) — but the team is on the **Hobby**
plan, which allows a cron once a day and fails the deploy for anything more frequent.
Options for the owner: Vercel Pro (then a `crons` entry in `vercel.json`), or an external
scheduler calling `GET /api/backend/jobs/run?tier=frequent` with the secret.
