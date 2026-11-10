---
status: accepted
date: 2026-11-11
decision-makers: platform engineering
---

# ADR-0001: Message email throttle per recipient company

## Context and Problem Statement

US-603 limits message emails to one per conversation per 10 minutes, so that a
burst of chat messages does not flood an inbox. The limit was stored as a single
marker per thread (`MessageThread.lastEmailNotifiedAt`). Any message that emailed
anyone started the window for everyone, including the sender's own company.

In production on 2026-11-10, one side wrote at 10:05:56 and the other replied six
times between 10:07 and 10:10. None of the six replies was emailed, which the
client reported as US-603 TC-2. How should the window be scoped so that a party
always hears about messages addressed to them?

## Decision Drivers

* A message addressed to a company must not be throttled by that company's own activity.
* Keep "one email per burst" (TC-2), with no extra scheduler. The platform's
  frequent cron runs only a few times a day.
* Be race-safe under concurrent posts.

## Considered Options

* Marker per thread (status quo)
* Marker per (thread, recipient company)
* Marker per (thread, recipient user)
* Trailing digest of throttled messages at the end of the window

## Decision Outcome

Chosen option: **marker per (thread, recipient company)**, in a new table
`MessageThreadEmailMark`. Each recipient company is claimed inside the message's
transaction: `createMany … skipDuplicates`, otherwise
`updateMany … where lastEmailedAt <= now − 10 min`. A company that wins is
emailed. The email tells the reader that further messages within 10 minutes
appear in-app only.

Per-user marks would track email preferences more closely, but they multiply
writes and gain nothing, because every member of a company is notified together.
A trailing digest needs a timely scheduler, which the platform lacks (see the RFQ
delivery audit).

### Consequences

* Good: replies are always emailed to the other side; a burst still yields one email per recipient.
* Good: multi-party order threads (appointed logistics companies) get independent windows.
* Neutral: a migration is required and must run before the deploy.
* Bad: messages 2..n of a burst are announced only in-app. The first email says so.

### Confirmation

* `apps/api/src/modules/messaging/throttle.test.ts` replays the production timeline and the TC-2 burst.
* The release record `docs/2026-11-client-review.md` covers a local PostgreSQL
  replay: replies emailed, burst throttled, every in-app notification created.

## More Information

`MessageThread.lastEmailNotifiedAt` is retained, unused, for one release. It
should be dropped in a later migration.
