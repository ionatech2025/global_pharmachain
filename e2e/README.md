# End-to-end tests

Three browser suites run against a running stack (local or deployed — set
`E2E_BASE_URL`):

- **`golden-path.spec.ts`** — the Phase 1 golden path: the seeded buyer
  raises an RFQ, the seeded supplier finds it in the quote inbox and quotes,
  the buyer accepts (creating an order), the seller advances the shipment,
  and the buyer sees the new stage plus history. Each persona runs in its own
  browser context.
- **`endpoints.spec.ts`** — read coverage of every `/api/backend` GET across
  all controllers, signed in as an OPERATIONS user, a COMPANY_ADMIN and the
  super admin, plus RBAC / auth / validation negative paths.
- **`regression.spec.ts`** — hardening properties that must not silently
  regress: helmet security headers, no `x-powered-by`, per-client-IP
  throttling, the consistent JSON error envelope, and no account enumeration.

## Running locally

```bash
docker compose up -d               # PostgreSQL + MinIO (or any Postgres)
bun run db:migrate:deploy && bun run db:seed
bun run --filter @pharmachain/api start &          # api :3001
bun run --filter @pharmachain/web build
(cd apps/web && bunx next start --port 3000) &     # web :3000
bunx playwright install chromium   # once
bun run test:e2e
```

The API and web app must share `AUTH_SECRET`; the spec signs in with the
seeded demo users (`ops@nilepharma.demo` / `ops@kampalafinechem.demo`,
password from `SEED_DEMO_PASSWORD`, default per `.env.example`). Set
`E2E_BASE_URL` to point at a different web origin.

## Coverage notes

- The flow exercises auth, RBAC-gated navigation, marketplace data, the RFQ
  lifecycle, quotation submission, award → order creation, and shipment
  status updates with buyer-visible history.
- Document upload (presigned PUT → complete → scan) is not covered — it
  needs object storage with real objects; the seed's placeholder documents
  cover list/checklist rendering only.
- The suite is single-worker and stateful within a run; every run tags its
  RFQ title with a unique run id, so re-runs against the same database don't
  collide.
