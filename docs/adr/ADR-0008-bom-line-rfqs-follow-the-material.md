---
status: accepted
date: 2026-11-25
decision-makers: platform engineering
---

# ADR-0008: An open RFQ follows its BOM material across versions; activation never cancels an RFQ

## Context and Problem Statement

A BOM version is never overwritten. Editing creates version n+1 with every line
stored as a new row, and an RFQ records the row it was raised from
(`Rfq.bomItemId`). The BOM page matched RFQs to lines by that row. So after any
edit, every line of the new version offered **Raise RFQ** again, even for a
material whose RFQ was still open with suppliers. That invited a duplicate RFQ.

The client's review of 2026-11-25 asked two related questions. Should a
quantity changed in the RFQ form be written back to the BOM? And what happens
to an open RFQ when a new version deletes its line and is activated?

## Decision Drivers

* A version is a recipe record. It is never rewritten (US-801/803).
* The BOM holds a quantity **per production unit**. An RFQ asks for a purchase
  total. They are different numbers.
* Withdrawing a tender notifies every supplier who received it. That is the
  buyer's call, not a side effect of editing a recipe.
* The buyer should see what each material is being sourced at, from the BOM page.

## Considered Options

* Write the RFQ quantity back to the BOM line, in place or as a new version.
* Match RFQs to lines by material name across versions, show the RFQ's quantity
  on the line, and warn on activation about open RFQs that lose their line.
* Carry a stable line identity across versions (a new column and a migration).
* Cancel open RFQs automatically when the version that drops their line is activated.

## Decision Outcome

Chosen option: **match by material name, show the requested quantity, warn on
activation.**

* `bomSourcing` (`packages/core/src/bom-sourcing.ts`) decides which RFQ covers a
  line. The line's own RFQs come first, and an awarded one beats an open one.
  Without either, an **open** RFQ raised from the same material in another
  version covers it. The name is compared ignoring case and repeated spaces.
  An award does not carry over: it sourced an earlier recipe's batch, and the
  buyer must be able to raise the next one. Closed and cancelled RFQs free the line.
* The BOM page, the dashboard's **Stockout risk (BOM)** figure and the
  intelligence stockout list all use this rule (`activeBomLines` in
  `apps/api/src/modules/bom/bom-coverage.ts`), so they agree.
* The line shows its RFQ badge (*RFQ in progress · ‹ref›*) with the RFQ's
  quantity on its own line under it (*‹quantity› requested*). The BOM's own
  quantity per unit does not change.
* **Raise RFQ** pre-fills the form with the line's quantity per unit. A note
  under the field says the buyer should enter the total they need. The RFQ
  quantity must be more than zero with at most 4 decimal places, which is what
  its column (`Decimal(16,4)`) stores. A smaller per-unit figure is refused
  instead of being rounded on save.
* Activating a version that has no line for a material with an open RFQ opens
  a confirmation. It lists each of those RFQs and says they stay open.
  Activation itself never changes an RFQ.

Write-back was rejected. It would replace a per-unit figure with a purchase
total, and it would rewrite a version or create versions as a side effect of an
RFQ. A stable line identity was rejected for now. It needs a migration, and the
edit form would have to carry the identity through every add, remove and
reorder. A user already recognizes a line by its material name. Automatic
cancellation was rejected because it withdraws a live tender without the buyer
asking.

### Consequences

* Good: a kept line no longer offers a second RFQ while the first is open.
* Good: the buyer sees the requested quantity next to the recipe quantity.
* Good: deleting a line can no longer leave an open RFQ unnoticed. The buyer
  is told before activating.
* Neutral: the dashboard figure changes meaning slightly. It used to count a
  line as sourced if it had any RFQ at all, cancelled ones included. It now
  counts only open or awarded RFQs, as the intelligence list already did.
* Neutral: renaming a material breaks the match. The old name's RFQ is then
  listed as losing its line when the version is activated, so it is still seen.
* Neutral: two lines with the same material name in one version share an
  RFQ carried from another version.
* Bad: a CLOSED RFQ (deadline passed, award still possible) frees its line and
  is not listed on activation. This rule predates this decision; counting
  CLOSED as in progress would block **Raise RFQ** for good after an RFQ that
  drew no quotations.

### Confirmation

* `packages/core/src/bom-sourcing.test.ts` covers matching across versions,
  own RFQs first, an award not carrying over, and which RFQs a version leaves
  behind. `packages/core/src/schemas/rfq.test.ts` covers the quantity rule.
* `e2e/client-review-2026-11-25.spec.ts` drives the BOM page and the RFQ form
  in a browser. It checks the pre-filled quantity, the requested quantity on
  the line, the kept line's RFQ in version 2, the activation warning, and that
  the dropped line's RFQ is still `OPEN` afterwards, and that the intelligence
  stockout list does not report the kept line.
