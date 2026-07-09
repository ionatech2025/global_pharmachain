# End-to-end tests (placeholder)

Phase 1 ships this directory as a placeholder: `golden-path.spec.ts` encodes
the acceptance walkthrough as a skipped Playwright spec so the scenario is
version-controlled next to the code it verifies. Wiring it into CI is a
Phase 2 task (it needs a disposable stack: compose services + seeded DB).

## Running locally

```bash
docker compose up -d
bun run db:push && bun run db:seed
bun run dev                    # web :3000 + api :3001
bunx playwright install chromium
bunx --bun playwright test e2e # after removing the skip marker
```

## Golden path covered by the spec

1. Register a company → confirmation email (console) → status page shows
   `PENDING_VERIFICATION`.
2. Seeded super admin uploads-checks pass → approve → company `VERIFIED`.
3. Supplier publishes profile + listing (with SDS upload).
4. Buyer raises an RFQ (usage meter moves) → supplier quotes → resubmits
   (supersede) → buyer accepts → order at `ORDER_CONFIRMED`.
5. Seller advances shipment stages with notes; buyer sees tracker + gets
   notifications; order documents upload via presigned PUT.
6. Freemium limit blocks the next RFQ → credit request → admin confirms →
   limit raised.
7. User requests deletion → admin anonymizes within the queue.
