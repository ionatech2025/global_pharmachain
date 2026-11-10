---
status: accepted
date: 2026-11-11
decision-makers: platform engineering
---

# ADR-0003: Cancelled RFQs stay in the supplier inbox until their deadline

## Context and Problem Statement

The supplier Quote inbox listed only `OPEN` RFQs. When a buyer cancelled, the RFQ
disappeared from every supplier's inbox at once. A supplier part-way through a
quotation saw it vanish without a reason, and the client could not run US-407 TC3
("attempt to submit a quotation against a cancelled RFQ → blocked") at all.
Should a cancelled RFQ remain visible, and to whom?

## Decision Drivers

* A supplier who was given an RFQ should learn of its cancellation where they work, not only by notification.
* Keep the inbox a list of what can be acted on.
* Only show an RFQ to companies it was actually delivered to.

## Considered Options

* Hide on cancel (status quo)
* Keep it, marked cancelled, until its original deadline, for the companies it was delivered to
* Add a third "Closed" tab

## Decision Outcome

Chosen option: **keep it, marked cancelled, until its original deadline**,
limited to the companies with a delivered `RfqDistribution` row. That is the same
audience the cancellation notice reaches (`rfqAudience`).

Open RFQs sort first. A cancelled row shows *Cancelled — by the buyer, ‹time› — no
quotation needed* and **View** instead of **Quote**. The RFQ page leads with a
*Quotations closed* notice, and the API's 409 names the reason (cancelled,
awarded or deadline passed).

### Consequences

* Good: the cancellation is explained in context, and TC3 can be exercised.
* Neutral: the inbox can hold rows that cannot be quoted on; they leave at the RFQ's deadline, as open ones do.
* Bad: none known. A third tab was rejected as heavier for a short-lived state.

### Confirmation

* `e2e/client-review-2026-11-11.spec.ts` (US-407 TC3) checks the inbox row, the
  page notice and the 409 message.
