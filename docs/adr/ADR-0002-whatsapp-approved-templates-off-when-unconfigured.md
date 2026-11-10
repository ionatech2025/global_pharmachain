---
status: accepted
date: 2026-11-11
decision-makers: platform engineering
---

# ADR-0002: WhatsApp via approved templates; off when unconfigured

## Context and Problem Statement

US-604 promises WhatsApp notifications and a verified WhatsApp number. Production
never had a WhatsApp provider configured, so the factory fell back to a console
provider. That provider logged the verification code and every notification,
while the UI said *"Verification code sent"* and outbox rows were marked sent.

The Meta adapter also sent free-form `type: "text"`. Meta accepts that only
inside the 24-hour window after the user messages the business; a business may
open a conversation only with an approved template. How should the channel
behave when it is unconfigured, and how should it send when it is configured?

## Decision Drivers

* Never claim a delivery that did not happen: not in the UI, and not in the outbox evidence.
* Follow Meta's rule for business-initiated messages.
* Keep a stand-in for local development and tests.

## Considered Options

* Keep the console fallback in all environments (status quo)
* Remove WhatsApp entirely until it is integrated
* Off unless fully configured; templates for every send; console allowed outside production only

## Decision Outcome

Chosen option: **off unless fully configured; templates; console outside
production only.**

`whatsappConfigFromEnv()` returns `meta` only when four values are set: token,
phone-number id, an *Authentication* (copy-code) template and a *Utility*
template with one parameter. It returns `console` only when not in production,
and `off` otherwise. When the channel is off:

* the account page and the notification preferences say WhatsApp is unavailable;
* `PUT /auth/me/whatsapp` returns 409 `CHANNEL_UNAVAILABLE`;
* `notify()` queues no WhatsApp rows.

The verification code is sent before the number is saved, and a failed send is
a 502 `DELIVERY_FAILED`. `health/ready` reports the mode.

### Consequences

* Good: the client sees an honest "not available yet" instead of a code that never comes.
* Good: switching on is configuration only (`docs/runbook-whatsapp.md`), with no code change.
* Neutral: until the operator sets it up, WhatsApp is unavailable to every user.
* Bad: the Meta path is verified against captured payloads, not yet against a live
  account. The first real setup must follow the runbook's checks.

### Confirmation

* `packages/notifications/src/whatsapp.test.ts` covers the configuration rules and the exact template payloads.
* `e2e/client-review-2026-11-11.spec.ts` (US-604) asserts the UI and API for whichever mode `health/ready` reports.
