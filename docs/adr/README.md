# Architecture decision records

Decisions that shape how the platform behaves, in [MADR 4.0](https://adr.github.io/madr/)
format. Each record states the problem, the decision, its consequences and how it is
confirmed (the tests or checks that hold it in place). Earlier decisions live in the dated
review records under `docs/` (e.g. `2026-10-client-review.md`); new ones are recorded here.

| ADR | Title | Status | Date |
| --- | --- | --- | --- |
| [0001](ADR-0001-message-email-throttle-per-recipient.md) | Message email throttle per recipient company | Accepted | 2026-11-11 |
| [0002](ADR-0002-whatsapp-approved-templates-off-when-unconfigured.md) | WhatsApp via approved templates; off when unconfigured | Accepted | 2026-11-11 |
| [0003](ADR-0003-cancelled-rfqs-stay-in-supplier-inbox.md) | Cancelled RFQs stay in the supplier inbox until their deadline | Accepted | 2026-11-11 |
| [0004](ADR-0004-shipment-stage-actions-and-admin-corrections.md) | Shipment stage actions follow the API's actor rule; platform corrections start from an admin order list | Accepted | 2026-11-12 |
| [0005](ADR-0005-live-order-page-change-feed.md) | The order page follows the order over the polling change feed | Accepted | 2026-11-12 |
| [0006](ADR-0006-request-log-from-fastify-hooks.md) | The request log is written from Fastify hooks, not a Nest interceptor | Accepted | 2026-11-12 |
