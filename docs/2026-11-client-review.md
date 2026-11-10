# Client review of 2026-11-11 — findings, fixes and verification

Source: `COMMENTS ON PHARMACHAIN WEBSITE_CLIENT.docx.pdf` (26 pages), the section
headed **"November 11, 2026 — US-407 – TC3"** on pages 23–25. Most of it is
screenshots, so the page images were read along with the extracted text. Every
comment was checked against the code and, where it described something that
happened, against production's own records. The fixes were then run on a real
PostgreSQL with a production build and a Playwright spec
(`e2e/client-review-2026-11-11.spec.ts`).

The earlier sections of the same PDF (October 20 – November 6) are covered by
`docs/2026-10-client-review.md` or are not part of this change.

## Comment → outcome

| # | Comment | Verdict | What changed |
| --- | --- | --- | --- |
| 1 | **US-407 TC3**: "attempt to submit a quotation against a CANCELLED RFQ → blocked" — *not possible since the RFQ disappears* (Figure 7: supplier inbox empty) | The block existed; the test could not be reached | A cancelled RFQ now stays in the supplier's inbox until its original deadline, marked **Cancelled — by the buyer, ‹time› — no quotation needed**, with **View** instead of **Quote**. The RFQ page opens on a **Quotations closed** notice that gives the reason; the form is disabled; the API refuses with the reason (409 *"The buyer cancelled this RFQ — it no longer accepts quotations"*). A quotation already sent on a cancelled RFQ is marked *RFQ Cancelled* under Quotations sent. |
| 2 | **Oversized document**: US-602 TC3 says 10MB per file; the message says 4MB — choose one | **4MB per file**, unchanged | The 4MB cap and every message showing it come from one constant (`MAX_FILE_SIZE_BYTES`). The limit is set by the hosting platform: Vercel refuses any request body over 4.5MB before our code runs. 10MB would mean uploading straight to object storage, which needs a CORS rule on the R2 bucket. The one place that still said 10 MB, `docs/implementation-plan.md`, is corrected. **US-602 TC3 should read 4MB.** |
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
   uploads, which needs a CORS rule on the R2 bucket.
2. **WhatsApp:** a Meta Business account, a WhatsApp Business phone number, a
   permanent token and two approved templates (`docs/runbook-whatsapp.md`).
   Until then WhatsApp is shown as unavailable.
3. **Credentials:** the super-admin and demo passwords listed in the PDF are also
   the defaults written into `.github/workflows/db-seed.yml`, in a public
   repository. Rotate them and remove the defaults from the workflow.
4. The demo accounts use `*.demo` addresses, which cannot receive mail. Test
   email delivery (US-603) with accounts on real mailboxes.
