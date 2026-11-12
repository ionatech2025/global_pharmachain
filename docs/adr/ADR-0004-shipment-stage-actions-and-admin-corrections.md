---
status: accepted
date: 2026-11-12
decision-makers: platform engineering
---

# ADR-0004: Shipment stage actions follow the API's actor rule; platform corrections start from an admin order list

## Context and Problem Statement

The client's 2026-11-12 review raised three problems with the 13-stage shipment
tracker (US-701):

1. The order page showed **"Advance to …"** to every party on the shipment. The
   API only lets certain parties set each stage (`canActorSetStage`). So the
   supplier at *Delivered* got a button that the API refused with a 403, and the
   page never said who sets stage 13. The client asked: "Who completes step 13?
   Should it be the system admin? But how?"
2. US-701 TC4 says "a System Admin corrects a status set in error; the change is
   applied and recorded in the audit log with a reason". The API already
   supported this (the `admin` shipment role, a mandatory reason, an
   `order.status-correct` audit row with the reason column). But a platform admin
   had no way to reach an order. The dashboard showed an order count with no
   link, `/orders` needs a company membership, and no admin page listed orders.
3. The status dialog kept the stage it was first rendered with (see the review
   record).

Where should the decision about who may act on a stage live, and how does a
platform admin reach an order to correct it?

## Decision Drivers

* The page must never offer an action the API will refuse.
* A party who cannot act should still see who will act next.
* Admin corrections stay exceptional: they need a reason, they are audited, and
  every party is told.
* No schema change.

## Considered Options

* Keep a hand-written list of who may act on the page (status quo)
* Derive the page's action from the core rule the API enforces (`canActorSetStage`)
* Let the platform admin confirm delivery on the buyer's behalf as a normal step

## Decision Outcome

Chosen option: **derive the action from `canActorSetStage`**. The API and the
web app now apply the same function, and corrections start from a new admin
order list.

* `statusModeFor(order)` returns `advance`, `confirm` (the buyer at
  *Delivered*), `correct` (a platform admin) or nothing. Company roles without
  `order:update-status` (Finance) get nothing, as the API already requires.
* Every party sees **"Next: N. ‹stage› — set by ‹who›"**. The text comes from
  `stageSetBy()`, which is derived from the same rule. Stage 13 is labelled
  *by the buyer* on the tracker. A completed order says who confirmed it and when.
* **Stage 13 stays with the buyer.** The platform admin does not confirm
  delivery as a normal step. If an order needs correcting, the admin uses the
  audited correction, which can set any stage.
* `GET /admin/orders` (super admin) lists every order. It supports search (order
  number, item, RFQ, either company) and filters: in progress, past ETA,
  awaiting buyer confirmation, completed, or one exact stage. The page is
  `/admin/orders`, linked from the sidebar, the dashboard's Orders tile and the
  dashboard quick actions. Each row opens the normal order page. There the admin
  gets **Correct status**: any stage, a required reason (at least 5
  characters, enforced by both the form and the API), and an **Audit trail**
  link to `/admin/audit?entityType=Order&entityId=…`. The audit-log API gained
  the `entityId` filter for that link.

### Consequences

* Good: the page and the API cannot disagree about who acts. The tester's
  question is answered on the page itself.
* Good: TC4 can be exercised end to end, and the reason is visible in the audit
  log and in the order's status history.
* Neutral: transporters and clearing agents now see a button only for the legs
  they drive. Before, they could click buttons that the API refused.
* Bad: none known. A correction is still recorded as an ordinary status event
  with the reason as its note. The audit log, not the event, marks it as a
  correction.

### Confirmation

* `packages/core/src/state-machines.test.ts`: `stageSetBy` names the buyer for
  stage 13 and the right parties for the other stages.
* `e2e/client-review-2026-11-12.spec.ts`: the supplier at *Delivered* has no
  action, is told "set by the buyer", and gets a 403 from the API. The buyer
  confirms through **Confirm delivery**. The admin finds the order in
  `/admin/orders`, is refused without a reason (400), corrects with one, and
  finds `order.status-correct` with the reason on the order's audit trail.
* `e2e/routes.spec.ts` renders `/admin/orders`.
