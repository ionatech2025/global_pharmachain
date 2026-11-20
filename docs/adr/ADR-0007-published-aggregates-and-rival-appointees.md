---
status: accepted
date: 2026-11-20
decision-makers: platform engineering
---

# ADR-0007: Price and deal figures come only from settled records no single company can isolate, over closed periods; rival bidders cannot be appointed to an order

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

Chosen: **option 3, applied only to records whose set of knowers can no longer
grow, over closed periods**, plus a guard on appointments.

* `isAnonymous(contributions)` in `apps/api/src/modules/intelligence/series.ts`
  takes each contribution's `key` (whose figure must stay hidden) and `parties`
  (who already knows it). A figure is published only when at least two
  contributors are blended, and every party, after removing what it knows, is
  left with none or at least two.
* **The parties must be complete and final, or the rule means nothing.** The
  first version of this ADR modelled a quote's knowers as its supplier and
  buyer, and an order's as buyer, seller and current appointees. An
  independent review broke it three ways, each reproduced against the real
  service: a winning quote becomes the order's price, which every logistics
  partner the buyer appoints reads; appointments can be added after a figure
  is published; and the report blended months the chart withheld. Each patch
  on that model would have had to guess who might know a figure later. So:
  * **Prices** count only quotations that **did not win**, on RFQs whose award is
    **settled**: `AWARDED`, `CANCELLED`, or `CLOSED` with no quote left that
    could still be awarded (award needs an `ACTIVE` quote inside its validity).
    Every version from the winning supplier counts as won, since an earlier
    version often carries the order's price, and replaced (`SUPERSEDED`)
    offers are left out (a quote is replaced only while its RFQ is open).
    `quoteStanding` decides both. A losing quote's price is known to its
    supplier and the RFQ's buyer only, for good. A month waits until every RFQ
    quoted in it is settled, so it never changes once shown. Parties: supplier
    and buyer.
  * **Deal totals** are published only when every order in the period is
    `DELIVERY_CONFIRMED`. Parties: buyer, seller and every company ever
    appointed (`dealTotal`). Nobody can be appointed to an order once its
    delivery has been confirmed, even if a platform admin later corrects the
    stage back (`deliveryConfirmedAt` is never cleared), and the appointment
    re-checks this inside its transaction with a conditional update on the
    order row.
  * **Demand volume** is withheld. RFQ quantities carry free-text units, so their
    sum is no quantity, and every verified supplier of the targeted type sees
    each RFQ, so its knowers cannot be bounded.
* **One source for both endpoints.** The market report's category price is
  `publishedAverage`: the average over exactly the months the chart may show
  in the quarter, in one unit and currency (it used to blend USD with UGX).
  Report rows now carry `currency` and `unit`.
* **Closed periods.** The price chart shows the last 12 completed months. The
  market report covers the last completed calendar quarter (`period`, for
  example `2026-Q3`), and its trade totals cover that quarter, not all time.
  Its JSON field names (`rfqCount90d` and so on) are kept so subscribers'
  parsers keep working; `demandVolume90d` is now always `null`.
* Option 1 fails when one supplier sends several quotes. Option 2 fails when
  one company is party to several deals in a total. Option 4 makes the figures
  wrong for everyone and is not needed at this scale.
* **Appointments.** `LogisticsService.appoint` refuses a company that quoted on
  the order's RFQ, unless it is the order's seller, with a message that says why.
* **Quote state changes are atomic.** `acceptQuotation` marks the quote
  `ACCEPTED` only if it is still `ACTIVE` and inside its validity, in the same
  transaction that awards the RFQ. `resubmitQuotation` re-checks inside its
  transaction that the RFQ is still `OPEN` before its deadline, under a
  `FOR SHARE` lock on the RFQ row (the row the award, close and cancel update
  first, so they queue), and supersedes the old version only if it is still
  `ACTIVE`. The lock writes nothing: bumping the RFQ's `updatedAt` would show
  every supplier's live feed that a rival had revised its quote. `withdrawQuotation` withdraws only an
  `ACTIVE` quote. So a quote is never replaced after its RFQ is settled, and a
  published month never moves.
* **One snapshot.** The price query reads each quote's RFQ, order and live
  quotes inside one `RepeatableRead` batch transaction, so an award landing mid-read
  cannot show a winning quote as a settled loss.
* The order page hides "Appoint partner" once delivery has been confirmed.

### Consequences

* Good: the landing page's statements ("competing suppliers never see each
  other's quotations", the FAQ on who sees what) hold for the published
  intelligence too.
* Bad: figures appear later (after awards settle and orders are confirmed) and
  more often show as gaps or "—" on today's small network. Winning prices, the
  most telling ones, are never in the price index. The chart and report say why.
* Bad: the market report is up to three months old by design, and no longer
  has a demand volume.
* Neutral: collusion between companies, or one firm acting through several
  registered companies, is outside this model.
* Neutral: appointments made before this change are not revoked. If one exists,
  the buyer chose that partner for a live shipment; revoking it would cut the
  shipment's logistics. New ones are refused.

### Confirmation

* `apps/api/src/modules/intelligence/series.test.ts` (32 tests): one-supplier,
  two-supplier and buyer-holds-all-but-one months are gaps (on the first code
  they published `11`, `10.75`, `12`); a winning quote, and any version from its
  supplier, is left out; a month with an unsettled RFQ waits; the report
  average uses only the chart's months and one currency; deal totals wait for
  delivery and refuse an appointee on two of three deals; closed windows hold
  across the year boundary.
* Independent reviews ran attacks against the real `IntelligenceService`,
  `ShipmentService` and `LogisticsService` over an in-memory database. Each
  one was reproduced on the code it broke and fails on the final code:
  * reading a withheld price off chart plus report (23.42 for 23.4);
  * a UGX price (61500.01);
  * an appointee reading a third supplier's price (17.36 for 17.35);
  * the same through a winner's superseded version;
  * a later appointee reading a deal (77250);
  * the same after an admin stage correction, and with a confirmation forced
    between the appointment's check and its insert;
  * a resubmission racing the award, which moved a published month by the
    replaced offer (31.72 for 31.7);
  * a supplier reading an RFQ quantity (3750);
  * replaced offers skewing the index (21.8 for 13).
* Randomized checks (30,000 categories with mixed states, plus a run across
  settlement) found no published figure from which one price could be solved.
  A control that injects a differencing pair finds thousands, so the check
  detects leaks.
* Local API: appointing the losing bidder returns 400 "... quoted on this
  order's RFQ and was not awarded it ..."; a forwarder that never bid is still
  appointed (201).
