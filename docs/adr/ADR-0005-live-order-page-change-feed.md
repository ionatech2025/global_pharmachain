---
status: accepted
date: 2026-11-12
decision-makers: platform engineering
---

# ADR-0005: The order page follows the order over the polling change feed

## Context and Problem Statement

Client review 2026-11-12 (Figure 10): a shipment status update "seems to update
only after a manual page refresh … we should have it reload/update without
manual refresh". The order page is server-rendered. It changed only when the
person who made the change triggered a refresh, and nobody else watching the
same order saw anything until they reloaded.

The RFQ page and the supplier inbox already solved this with `changeFeed`
(`apps/api/src/lib/change-feed.ts`). It is a server-sent-events stream that
polls a cheap fingerprint and says only "changed". The page then re-renders
itself through `router.refresh()` (`LiveRefresh`). Should the order page use
the same mechanism?

## Decision Drivers

* Every party (buyer, seller, appointed logistics companies, platform admin)
  should see stage changes, exceptions, documents, payments and disputes without
  reloading.
* The API runs as serverless functions with no broker. Neon's pooled
  connections cannot hold `LISTEN`.
* Keep one read path. The stream must not carry order data.

## Considered Options

* Fixed client-side polling of the whole page
* `changeFeed` + `LiveRefresh`, as on the RFQ page
* Push through a third-party realtime service

## Decision Outcome

Chosen option: **`changeFeed` + `LiveRefresh`**. `GET /orders/:id/stream` checks
access once, with the same rule as reading the order (`resolveShipmentRole`;
anyone else gets 404). It then emits only when `orderFingerprint` moves. The
fingerprint combines the order row's stage and `updatedAt`, which covers ETA and
freight details, with counts of status events (exceptions add one without
touching the order), tracking points, documents and active logistics
appointments, proof of delivery, and the newest payment and dispute `updatedAt`.
The fingerprint is one Prisma call, which runs a few small indexed queries.

### Consequences

* Good: a stage change appears on every open copy of the order within a few
  seconds, and client state such as a half-typed form survives the re-render.
* Neutral: each visible order tab holds one stream. Each stream runs a small
  indexed read every 3 s, ends after about 55 s and reconnects, as the RFQ feeds
  do. Hidden tabs close their stream.
* Bad: a change to an appointed company's own profile does not move the
  fingerprint. It is not part of the order and appears on the next navigation.

### Confirmation

* `apps/api/src/modules/order/order-fingerprint.test.ts`: the fingerprint moves
  for each part of the page it watches, stays stable otherwise, and fits in an
  SSE id.
* `e2e/client-review-2026-11-12.spec.ts`: the buyer's open page shows the
  supplier's API-made stage change without a reload, and the supplier's open
  page shows the buyer's delivery confirmation. Both are checked with a
  window marker that a full page load would wipe.
