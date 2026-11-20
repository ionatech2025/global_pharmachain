---
status: accepted
date: 2026-11-20
decision-makers: platform engineering
---

# ADR-0007: Price and deal figures are published only when no single company can isolate one, from closed periods; rival bidders cannot be appointed to an order

## Context and Problem Statement

While the landing page's privacy claims were being checked against the code
(PR #43), two ways for one company to read another's commercial terms were
found:

* **Aggregates.** `GET /intelligence/prices` (open to every company) published
  each category's monthly average quoted unit price however few quotes the
  month held. A month with one quote showed that supplier's price. With two
  quotes, either supplier could subtract its own from twice the average and
  read the other's. This was reproduced with the real `categoryPriceTrends`.
  The subscriber market report (`GET /intelligence/market-report`) had the same
  gap in its 90-day average price per category, its demand volume, and its
  trade total per currency. A currency with one order showed that deal's value,
  though the report said "no per-deal values are included".
* **Differencing.** Both were computed live over rolling windows. Reading a
  figure before and after one new record shows that record by subtraction, and
  an old quote version dropping out of a month when its supplier resubmitted
  did the same.
* **Rival appointees.** A buyer appoints logistics partners to an order, and an
  appointee reads the order, including the awarded price and quotation terms.
  Nothing stopped a buyer from appointing a forwarder that had quoted on the
  same RFQ and lost. Reproduced on the local API: the appointment returned 201.

How should figures built from other companies' prices and deals be published,
and who may be appointed to an order?

## Decision Drivers

* No company may learn a specific competitor's price or a specific deal's value
  from anything the platform publishes, including by combining it with what the
  company already knows (its own quotes, the quotes it received, its own
  orders).
* Charts should stay useful where the market is deep enough, and say plainly
  why they are empty where it is not.
* Appointment exists so a buyer can bring in its logistics partners, not to
  give bidders a second look at the deal.

## Considered Options

1. A fixed minimum number of quotes per figure.
2. A minimum number of distinct contributing companies per figure.
3. A rule over who already knows each figure: after any company removes the
   contributions it is party to, at least two contributors must remain.
4. Adding noise to published figures.

## Decision Outcome

Chosen: **option 3, over closed periods**, plus a guard on appointments.

* `isAnonymous(contributions)` in `apps/api/src/modules/intelligence/series.ts`
  takes each contribution's `key` (whose figure must stay hidden) and `parties`
  (who already knows it). A figure is published only when at least two
  contributors are blended, and every party, after removing what it knows, is
  left with none or at least two.
  * Quotes: key = supplier, parties = supplier and the RFQ's buyer. In practice
    a month needs three suppliers, and no buyer may have received all but one.
  * Orders: key = order, parties = buyer, seller and every appointee.
  * Demand volume: key = buyer, parties = buyer. Suppliers already see the RFQs
    aimed at their type, so they are not modelled as parties (a `shortcut:`
    comment marks this).
* Option 1 fails when one supplier sends several quotes. Option 2 fails when
  one company is party to several deals in a total. Option 4 makes the figures
  wrong for everyone and is not needed at this scale.
* **Closed periods.** The price chart shows the last 12 completed months and
  counts every quotation submitted in them, revisions included, so a published
  month never changes. The market report covers the last completed calendar
  quarter (`period`, for example `2026-Q3`), and its trade totals cover that
  quarter, not all time. Its JSON field names (`rfqCount90d` and so on) are
  kept so subscribers' parsers keep working.
* **Appointments.** `LogisticsService.appoint` refuses a company that quoted on
  the order's RFQ, unless it is the order's seller, with a message that says why.

### Consequences

* Good: the landing page's statements ("competing suppliers never see each
  other's quotations", the FAQ on who sees what) hold for the published
  intelligence too.
* Bad: on today's small network many months and categories show as gaps until
  three suppliers quote in them. The chart says so. The report shows "—".
* Bad: the market report is up to three months old by design.
* Neutral: appointments made before this change are not revoked. The rule
  applies to new ones.

### Confirmation

* `apps/api/src/modules/intelligence/series.test.ts`: on the old code, a
  one-supplier month published `11`, a two-supplier month `10.75`, and a month
  where one buyer had two of three quotes `12`. All three are now gaps. Order
  totals where one company was party to two of three deals are withheld. Closed
  windows are tested across the year boundary.
* Local API: `/intelligence/prices` covers months `2025-11..2026-10` on
  2026-11-20, and the market report period is `2026-Q3`.
* Local API: appointing the losing bidder now returns 400 "... quoted on this
  order's RFQ and was not awarded it ...". A forwarder that never bid is still
  appointed (201).
