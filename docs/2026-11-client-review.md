# Client review of 2026-11-06, 2026-11-11 and 2026-11-12 — findings, fixes and verification

The **November 12** section is [below](#november-12-2026--shipment-status-admin-follow-up-stage-13),
followed by **November 6** ([below](#november-6-2026--marketplace-filters-apply-without-a-button)).

Source: `COMMENTS ON PHARMACHAIN WEBSITE_CLIENT.docx.pdf` (26 pages), the section
headed **"November 11, 2026 — US-407 – TC3"** on pages 23–25. Most of it is
screenshots, so the page images were read along with the extracted text. Every
comment was checked against the code and, where it described something that
happened, against production's own records. The fixes were then run on a real
PostgreSQL with a production build and a Playwright spec
(`e2e/client-review-2026-11-11.spec.ts`).

The earlier sections of the same PDF (October 20 – October 29) are covered by
`docs/2026-10-client-review.md`. The November 6 comment was missed at the time
and is addressed in its own section at the end of this record.

## Comment → outcome

| # | Comment | Verdict | What changed |
| --- | --- | --- | --- |
| 1 | **US-407 TC3**: "attempt to submit a quotation against a CANCELLED RFQ → blocked" — *not possible since the RFQ disappears* (Figure 7: supplier inbox empty) | The block existed; the test could not be reached | A cancelled RFQ now stays in the supplier's inbox until its original deadline, marked **Cancelled — by the buyer, ‹time› — no quotation needed**, with **View** instead of **Quote**. The RFQ page opens on a **Quotations closed** notice that gives the reason; the form is disabled; the API refuses with the reason (409 *"The buyer cancelled this RFQ — it no longer accepts quotations"*). A quotation already sent on a cancelled RFQ is marked *RFQ Cancelled* under Quotations sent. |
| 2 | **Oversized document**: US-602 TC3 says 10MB per file; the message says 4MB — choose one | **4MB per file**, unchanged | The 4MB cap and every message showing it come from one constant (`MAX_FILE_SIZE_BYTES`). The limit is set by the hosting platform: Vercel refuses any request body over 4.5MB before our code runs. 10MB would mean uploading straight to object storage, which needs a CORS rule on the R2 bucket. The one place that still said 10 MB, `docs/implementation-plan.md`, is corrected. Every message and hint now says **"4MB per file"**, which is how US-602 TC3 should read. |
| 3 | **US-603 TC-2**: five chat messages within two minutes — no email to the offline recipient | **Real defect** | The email throttle was one marker per *thread*, so a company's own message used up the window for messages sent *to* it. Now one window per thread **per recipient company**. See below. |
| 4 | **US-604** WhatsApp: on by default but nothing arrives; no obvious place for the number; *"the code never comes — not integrated yet?"* (Figures 8–9) | **Yes — not integrated in production** | Production has no WhatsApp configuration. The fallback console provider wrote every code to the server log while the page said *"Verification code sent to your WhatsApp number"*. The channel is now **off** when it is not configured, and every screen says so. The Meta adapter has been rebuilt around approved templates, so it can work once the credentials exist. See below. |

## US-603: why no email arrived

Production's audit log for 2026-11-10 (UTC) shows the test conversation:

| Time | Who | What the old throttle did |
| --- | --- | --- |
| 10:05:56 | tester B | emailed A — **and started the thread's only 10-minute window** |
| 10:07:00 | tester A | inside the window → no email to B |
| 10:09:18 – 10:10:04 | tester A, five messages | inside the window → no email to B |
| 10:16:08 | tester B | window over → emailed A |

B's own message silenced the six messages addressed to B. The marker now lives in
`MessageThreadEmailMark (threadId, companyId, lastEmailedAt)` and belongs to the
**recipient**. Each recipient company is claimed atomically inside the message's
transaction: insert, or move the mark only if it is older than 10 minutes. The
first message to a recipient after a quiet spell is emailed. The email states
that further messages in the next 10 minutes will appear in Global PharmaChain without
another email. In-app notifications are never throttled.

The same timeline replayed on a local PostgreSQL: B's opening message emailed both
of A's users, A's reply emailed both of B's users (before: nothing), the burst
added no emails, and all 14 in-app notifications landed.

The old column `MessageThread.lastEmailNotifiedAt` is no longer read or written.
It stays for one release because builds serving during the rollout still select
it; drop it in a later migration.

## US-604: what WhatsApp needs

Meta lets a business start a conversation only with a **pre-approved template**.
Free-form text is accepted only inside the 24-hour window after the user
messages the business first. The old adapter sent free-form text, so it would
have failed even with credentials. Now:

- `WHATSAPP_PROVIDER` unset → **off**. The account page says WhatsApp is not
  available yet, saving a number answers 409 `CHANNEL_UNAVAILABLE`, the WhatsApp
  column leaves the notification preferences, and nothing is queued. `console`
  is refused in production.
- `meta` needs a token, a phone-number id and two approved templates. The
  verification code goes through an *Authentication* template with a copy-code
  button; notifications go through one *Utility* template that has one `{{1}}`
  parameter.
- The code is sent **before** the number is saved, and a failed send is an
  error (502 `DELIVERY_FAILED`). A working verified number is no longer replaced
  by one that cannot be reached.
- Until a user has a verified number, the WhatsApp switches show **off** and are
  locked, with a link to the account page — the client could not find where the
  number goes.
- `GET /health/ready` reports `"whatsapp": "off" | "console" | "meta"`.
- Saving a number is limited to 5 per 15 minutes (each one sends a paid
  message), and verifying to 10 per 15 minutes.

Switching it on is the client's step: `docs/runbook-whatsapp.md`.

## Verification

- Unit: `throttle.test.ts` (6, including the production timeline),
  `whatsapp.test.ts` (9: configuration rules and the exact Meta payloads); core
  147, email 32, API 104 unchanged and passing; typecheck and lint clean.
- Local stack (embedded PostgreSQL 18, production web build): the new spec 4/4
  with WhatsApp `console`, and the WhatsApp case again with the channel `off`
  (production's state); the US-603 replay above.
- Migration `20261111000000_thread_email_marks` applied cleanly on top of all
  earlier ones.

## Release notes

**Migrate first.** The message path writes `MessageThreadEmailMark`; on a
database without the table, posting a message fails. Run `db-migrate` with
`confirm=migrate` before the merge that deploys.

Rolling back is safe: older builds do not know the new table and go back to the
old throttle.

## Needs the client

1. **US-602 TC3:** change "10MB" to "4MB per file", or ask for direct-to-storage
   uploads, which needs a CORS rule on the R2 bucket. The app now states the
   limit in exactly that wording. The rejection reads *"That file is 16.8MB — the
   limit is 4MB per file"*, and the upload hints say *"max 4MB per file"*, all
   from one constant, `MAX_FILE_SIZE_RULE` (follow-up release, 2026-11-10).
2. **WhatsApp:** a Meta Business account, a WhatsApp Business phone number, a
   permanent token and two approved templates (`docs/runbook-whatsapp.md`).
   Until then WhatsApp is shown as unavailable.
3. **Credentials:** the super-admin and demo passwords listed in the PDF are also
   the defaults written into `.github/workflows/db-seed.yml`, in a public
   repository. Rotate them and remove the defaults from the workflow.
4. The demo accounts use `*.demo` addresses, which cannot receive mail. Test
   email delivery (US-603) with accounts on real mailboxes.

---

## November 12, 2026 — shipment status, admin follow-up, stage 13

Source: `COMMENTS ON PHARMACHAIN WEBSITE_CLIENT.docx-1.pdf` (28 pages), section
**"November 12, 2026"**, pages 25–27 (Figures 10–13). The section is mostly
screenshots, so the page images were read along with the text. Each comment was
traced to code. The fixes were run on a real PostgreSQL with a production web
build (`e2e/client-review-2026-11-12.spec.ts`). Decisions:
[ADR-0004](adr/ADR-0004-shipment-stage-actions-and-admin-corrections.md) and
[ADR-0005](adr/ADR-0005-live-order-page-change-feed.md).

### Comment → outcome

| # | Comment | Verdict | What changed |
| --- | --- | --- | --- |
| 1 | **Figure 10** (testing Epic 7): updating to *In transit* fails with *"Cannot move from Goods collected to Goods collected"*; *"this seems to update only after a manual page refresh … we should have it reload/update without manual refresh"* | **Real defect** (two parts) | **(a)** The status dialog stored its stage once, when the page first rendered. After one update the button said *Advance to In transit*, but the form still sent *Goods collected*, the stage the order was already at, so the API refused it until a reload. The dialog now takes the stage each time it opens. A genuine race now reads *"This order is already at ‹stage› — it was updated after your page loaded"*, and the page refreshes itself. **(b)** The order page now updates live for every party (buyer, supplier, logistics partners, platform admin): stage, ETA, history, documents, tracking, payments and disputes, within a few seconds and without a reload (ADR-0005). |
| 2 | **US-701 TC4** (Figure 11): *"System Admin corrects a status set in error → recorded in the audit log with reason — WHERE AND HOW DOES THIS HAPPEN"*; *"they see the number of orders, but cannot open them or follow them up"* | **The capability existed; there was no way to reach it** | New **Platform admin → Orders** (`/admin/orders`), linked from the sidebar, the dashboard's Orders tile and the dashboard quick actions. It lists every order with search (order no., item, RFQ, buyer, supplier) and filters (*In progress*, *Past ETA*, *Awaiting buyer confirmation*, *Completed*, or an exact stage, applied as soon as it is picked). An order opens on its normal page, where the admin has **Correct status**: any stage, a **required reason** (at least 5 characters, also enforced by the API), every party notified. The **Audit trail** button opens the order's own entries in the audit log, where the correction appears as `order.status-correct` with the reason. |
| 3 | **Figures 12–13**: *"Who completes step 13? Should it be the system admin? But how?"* | **The buyer**, but the page never said so, and it showed the supplier a button that failed | Stage 13 (*Delivery confirmed*) is the buyer's confirmation of receipt. It completes the order. When the order is *Delivered*, the buyer gets a **Confirm delivery** button ("this completes the order — stage 13 of 13; if something is wrong, raise a dispute instead"). The supplier used to see *Advance to Delivery confirmed*, which the API refused (403). Now no party is shown a stage action that it cannot take. Everyone reads **"Next: 13. Delivery confirmed — set by the buyer."** The tracker labels stage 13 *by the buyer*, and a completed order says who confirmed it and when. The platform admin does not confirm delivery on the buyer's behalf. If an order needs correcting, the admin uses the audited correction (row 2). |
| 4 | *(By message, same day)* "Fix also the WhatsApp business number: *Message Pharmachain Global Enterprises on WhatsApp. https://wa.me/256784528651*" | **Added**: the site had no WhatsApp contact | The landing page's contact block and its *Contact & Legal* footer list, and the disclaimer's contact paragraph, now show **WhatsApp: +256 784 528651**. It links to `https://wa.me/256784528651`, labelled *Message Pharmachain Global Enterprises on WhatsApp*. The number is `NEXT_PUBLIC_WHATSAPP_NUMBER`, a build-time setting next to `NEXT_PUBLIC_CONTACT_PHONES` (a single space hides it). This is the public chat line only. WhatsApp **notifications** still need the Meta Cloud API setup (`docs/runbook-whatsapp.md`, which now explains the difference). |

### Who sets each stage

The page derives this text from the same rule the API enforces
(`canActorSetStage`), so the two cannot disagree:

| Stages | Set by |
| --- | --- |
| 2 Pickup scheduled · 4 In transit · 5 At port of origin · 8 At port of destination | the supplier or forwarder |
| 3 Goods collected · 10 Inland transport · 11 Out for delivery · 12 Delivered | the supplier, forwarder or transporter |
| 6 Customs (origin) · 7 Departed · 9 Customs (destination) | the supplier, forwarder or clearing agent |
| 13 Delivery confirmed | the buyer |
| any stage, out of sequence, with a reason | a platform admin (correction, audited) |

Finance staff do not update shipments (US-204). The page no longer offers them
the button, which the API already refused.

The same stale-form flaw was found in two sibling dialogs on the order page.
**Set/Update ETA** and **Freight details** kept the values from the page's first
render. Now that the page follows the order live, reopening either after
another party's change would have saved the old values back, silently undoing
that change. Both now reload their fields from the current order each time they
open.

### Verification

- Unit tests: core 148 (adds `stageSetBy`), API 110 (adds the order-feed
  fingerprint and the stage-conflict messages), email 32, notifications 9.
  Typecheck and lint are clean.
- Local stack (embedded PostgreSQL 18, production web build): the new spec
  passes 5/5. It covers two updates in a row without a reload, the buyer's open
  page following the supplier's change, the admin flow from `/admin/orders`
  through to the audit trail, stage 13 from both sides, and the WhatsApp link
  on `/` and `/disclaimer`. `routes.spec.ts`, which now renders
  `/admin/orders`, passes 13/13.
- The previous order page was rebuilt and driven the same way. It reproduced
  Figure 10 exactly: after the first update, the dialog showed **In transit**
  but sent `{"status":"GOODS_COLLECTED"}`, and the API answered **409**. The new
  spec's case fails on that build and passes on this one.

### Release notes

**No migration.** This release adds no schema change. Merge and deploy as
usual. Rolling back is safe.

### Needs the client

1. Please re-run US-701 TC4 from **Platform admin → Orders**: open an order, use
   **Correct status**, then **Audit trail**.
2. Stage 13 is the buyer's step. Please run it as the buyer, using **Confirm
   delivery** once the order shows *Delivered*.

---

## November 6, 2026 — marketplace filters apply without a button

Source: the same PDF (`…CLIENT.docx-1.pdf`, 28 pages), section **"November 6,
2026"**, page 23. It was missed when the November 11 section was worked on and
found in a full audit of the PDF on 2026-11-12. Every other section of the PDF
(general comments, October 20, 27 and 29) is recorded as addressed in
`docs/2026-10-client-review.md`.

| Comment | Verdict | What changed |
| --- | --- | --- |
| Marketplace screenshot: *"When a user filters, they have to click the 'Search' button to get the filtered results, yet the 'Search' button looks to be for the search field … label that button 'Search/Filter' with a tooltip … Better would be if the results from the filter come, even without pressing the button."* | **Real usability defect** | We took the client's preferred option: **there is no button any more.** Category, Listing type, Country of origin and Sort by apply the moment they change. The search box updates the results as you type, after a short pause, the same way as the admin lists. A line under the filters says *"Results update as you type or change a filter — no button to press"* and changes to *"Updating results…"* while results load. Other filters are kept when one changes, and the list goes back to page 1. Every result set is still a shareable link. The *Filters:* chips and **Clear all** still remove filters, and the dropdowns reset to match. |

### Verification

- `e2e/client-review-2026-11-06.spec.ts` checks the following, all on the same
  page with no reload:
  - the search panel has no button;
  - choosing a listing type, then a sort order, applies each one immediately
    and keeps the previous filter;
  - typing in the search box applies the text and keeps the filters;
  - removing a chip resets its dropdown.
- The existing marketplace specs still pass on the local stack: the country
  list and sort labels (2026-10-29), dropdown contrast in light and dark mode
  (October 20/22), and the comparison tray (checklist cases 57 and 58).

