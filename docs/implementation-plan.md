# PharmaChain Phase 1 — implementation plan & traceability

Module-by-module map of the delivered scaffold, story traceability
(US-101 … US-1003) and the list of intentional stubs. The user stories in the
Phase 1 backlog PDFs are canonical; this document records where each one lands
in code.

> **Historical scope.** This file covers the Phase 1 MVP. Phases 2–5
> (logistics, payments/ledger, analytics/notifications, trace/webhooks/public
> API) shipped via PRs #40–#46 tracked in GitHub issues #1–#4, and the
> subsequent architecture-review remediation is traced in
> [`architecture-review-remediation.md`](architecture-review-remediation.md).
> The README's Architecture / Deployment sections describe the current
> system.

## Packages

| Package | Responsibility |
| --- | --- |
| `@pharmachain/core` | Zod v4 request/response contracts (`src/schemas/*`), enums + display labels, RBAC permission matrix, RFQ/quotation/order state machines (`state-machines.ts`), file rules (`files.ts`: allowed MIME types, 10 MB cap, expiry-required kinds), parameter keys and defaults (`params.ts`), ref-no + pagination utilities. Imported by **both** apps — the single source of contract truth. |
| `@pharmachain/db` | Prisma schema (26 models, `uuid(7)` ids, Decimal money, enum statuses), client singleton, seed (super admin, system parameters, categories, exchange rates, two verified demo companies, listings, demo RFQ). `build` = `prisma generate` so the Turborepo task graph generates the client before any typecheck/build. |
| `@pharmachain/auth` | Auth.js v5 config factory (JWT strategy, 30-min `maxAge`), Credentials providers (password, email-OTP) that call the API, server-side JWE decode helper used by the API guard (tries both dev/`__Secure-` cookie-name salts), shared `AuthenticatedUser` contract. |
| `@pharmachain/email` | Provider interface with `console` (dev) and SMTP (nodemailer) implementations; templates: welcome/confirmation, invite, password reset, OTP, verification decision, quotation received, new-message, expiry alert, tier change, credit confirmed. |
| `@pharmachain/notifications` | Event fanout: always in-app, email honouring per-user preferences and the per-thread email throttle, WhatsApp stub channel with silent fallback. |
| `@pharmachain/ui` | shadcn/ui components + Tailwind 4 oklch theme (dark mode via `next-themes`). |

## apps/api — NestJS 11 + Fastify on Bun

Cross-cutting (`modules/shared`): guard chain **Throttler → Auth (JWE decode,
ACTIVE + `sessionVersion` check) → Membership (company scoping, super-admin
bypass) → Policy (RBAC / verified-company / super-admin)**; logging + audit
interceptors (every mutation writes `AuditLog` with old/new values and
reason); `AllExceptionsFilter` producing the `{error:{code,message,details}}`
envelope; Zod validation pipe bound to `@pharmachain/core` schemas.

| Module | Endpoints (summary) | Stories |
| --- | --- | --- |
| `auth` | register, login, OTP request, forgot/reset password, invite accept, me, change password, WhatsApp number, data export, deletion request | US-101, 205, 206, 202, US-1003 |
| `company` | company profile get/patch/publish, verification status + checklist, members (role change, deactivate/reactivate), invites (create/list/revoke), usage meters, public directory profile | US-102, 105, 201, 203, 301, 905 |
| `catalogue` | listings CRUD, publish/deactivate/reactivate, search (filters + pagination + tier badges), categories, exchange rates (read) | US-302…306 |
| `rfq` | create (freemium limit txn), mine, supplier inbox, detail, cancel, quotation submit/resubmit/withdraw, comparison, accept → order | US-401…407, 906 |
| `order` | list, detail (snapshot, history, documents) | US-407, 701…703 |
| `shipment` | status transition (forward-only, super-admin correction audited), ETA patch | US-701…703 |
| `document` | request-upload (presign PUT), complete (scan stub), list, download URL (presign GET), replace (new version), soft delete | US-103, 305, 501…503 |
| `bom` | BOM by product, create/new-version, activate (one-ACTIVE transaction), raise-RFQ from line | US-801…803 |
| `messaging` | thread lookup/create (pairwise per RFQ-supplier; unique per quotation/order), list, messages (immutable, ≤5 attachments), email throttle | US-601…603 |
| `notification` | list, unread count, mark read/all, preferences get/put | US-604…606 |
| `announcement` | active announcements for the current user | US-902 |
| `billing` | credit requests (create, list own) | US-907 |
| `dashboard` | role-aware summary counts (null-company-safe for super admin) | US-901 |
| `admin` | verification queue + decide (conditional update), companies + tier, user overrides (reset password, deactivate/reactivate, role, **anonymize** — all with mandatory reason), login activity (≥5-failure flag), data-deletion requests, audit-log viewer, announcements CRUD + retract, parameters, exchange rates, credit request confirm/reject, stats | US-104, 204, 902…907, US-1003 |
| `jobs` | daily: document expiry alerts (param thresholds 60/30/7), `EXPIRED_DOCUMENT` flag, re-verification due; 15-min: RFQ auto-close + quotation validity expiry; hourly: token/OTP cleanup. In-process (`JOBS_IN_PROCESS=true`) or standalone `bun run jobs` worker. | US-103, 402, 404 |

## apps/web — Next.js 16 App Router

Auth wiring: Auth.js route handlers, login (password | OTP tabs), register,
invite-accept, forgot/reset, privacy page. `SessionKeepalive` pings the
session while the user is active; a 25-minute idle warning precedes sign-out.
Browser mutations go through `/api/proxy/[...path]` (session cookie → Bearer);
server components call the API directly with a typed client.

| Area | Screens |
| --- | --- |
| Dashboard | Role cards + freemium usage meters |
| Catalogue | My listings + form (SDS upload, publish gate), marketplace search + filters, client-side compare (≤4, sessionStorage), public company profiles |
| RFQs | Mine / new (BOM prefill) / detail with quotation comparison, accept, per-supplier threads; supplier quote inbox + quotation form (`quotes/`) |
| Orders | List + detail: 6-stage shipment tracker, status history, ETA, seller controls, order documents grouped by kind |
| Documents | Company document library with expiry badges + filters |
| Messages | Thread inbox + polling thread view (5 s), attachments |
| Company | Profile + publish, members + invites, verification checklist + uploads, usage & credit requests |
| Notifications | Centre + per-event email/WhatsApp preferences |
| Account | Password change, WhatsApp number, data export, deletion request |
| Admin | Dashboard, verification queue + review (automated checks, approve/reject, tier, member overrides), companies, login activity, announcements, parameters + FX rates, audit logs, credit requests, data-deletion queue |

## Story traceability

| Epic | Stories | Where |
| --- | --- | --- |
| E1 Registration & verification | US-101…105 | `api/auth.register`, `api/company` (verification), `api/document` (verification kinds, versioning), `api/admin` (queue + decide), jobs (expiry alerts, re-verification); web: register, company/verification, admin/verification, admin/companies/[id] |
| E2 Users & RBAC | US-201…206 | `api/company` (invites, members), `api/auth` (accept, login, OTP, reset), `api/admin` (overrides, login activity), shared guards; web: company/members, admin/logins, login/reset screens, idle-timeout dialog |
| E3 Catalogue | US-301…306 | `api/company` (profile publish), `api/catalogue`; web: company profile, catalogue, marketplace (search/compare) |
| E4 RFQ & quotations | US-401…407 | `api/rfq` (+ limit transactions), jobs (auto-close/expiry); web: rfqs/*, quotes/* |
| E5 Documents | US-501…503 | `api/document` + order-scoped access rules (admin access audited); web: orders/[id] documents, documents library |
| E6 Messaging & notifications | US-601…606 | `api/messaging` (pairwise threads, throttle), `api/notification`, `packages/notifications`; web: messages/*, notifications |
| E7 Shipment visibility | US-701…703 | `api/shipment` + `OrderStatusEvent`; web: orders/[id] tracker + controls |
| E8 BOM | US-801…803 | `api/bom` (versioning, one-ACTIVE, raise-RFQ link); web: BOM manager on finished-product listings, rfqs/new prefill |
| E9 Platform admin | US-901…907 | `api/admin`, `api/announcement`, `api/billing`, `api/dashboard`, freemium limit logic in `api/rfq`; web: admin/*, company/usage |
| E10 Security & data | US-1001…1003 | argon2id (now `@node-rs/argon2` for Node/Bun parity), guards, presigned storage, audit interceptor; backups + TLS in README deployment guide; GDPR: privacy page, `auth.me/export`, deletion request → `api/admin` anonymize |

## Intentional stubs (Phase 1)

| Stub | Interface lives in | Real integration |
| --- | --- | --- |
| Virus scan (marks uploads clean) | `api/document` scan step | Phase 2: ClamAV / vendor API |
| WhatsApp channel (console log + silent email/in-app fallback) | `packages/notifications` | Phase 2: WhatsApp Business API |
| SMS/WhatsApp OTP delivery (email OTP is live) | `packages/email` OTP template + channel adapters | Phase 2 |
| Payment for credit requests | `api/billing` (gateway checkout + webhook settlement) + `api/admin` (bank-transfer confirmation) | Done |
| Exchange rates (admin-managed, display-only) | `api/admin` FX endpoints | Phase 2: live FX feed |
| Playwright e2e | `e2e/` | Since grown into the real 35-test suite (golden path, routes, endpoints, security) — run with `E2E_BASE_URL` against any deployment |

Out of scope for Phase 1 (unchanged from the backlog): payments/escrow,
GPS/13-stage logistics, forwarder accounts, mobile apps, multi-language,
ratings, AI/blockchain, ERP integration, negotiation, partial fulfilment,
order amendment/cancellation, document approval workflows.
