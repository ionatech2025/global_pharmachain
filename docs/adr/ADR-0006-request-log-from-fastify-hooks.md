---
status: accepted
date: 2026-11-12
decision-makers: platform engineering
---

# ADR-0006: The request log is written from Fastify hooks, not a Nest interceptor

## Context and Problem Statement

The API writes one structured `"request"` log line per request: request id,
method, path, status, duration and user. A global Nest interceptor
(`LoggingInterceptor`) wrote it. While verifying the 2026-11-12 shipment fix,
a refused stage update that the client received as **409** appeared in the API
log as **200**. Two defects had the same cause:

* The interceptor logged in RxJS `finalize`. That runs before the global
  exception filter sets the error status, so every error thrown by a handler,
  pipe or service was recorded as 200 (or 201). The release runbook had told
  people to trust Vercel's request log instead.
* Nest runs guards before interceptors. Requests refused by a guard (401 not
  signed in, 403 no permission, 429 rate limited) and requests to unknown routes
  (404) produced **no** log line. The exception filter's own log lines for them
  had no request id either.

Where should the request log be written so that it reflects what the client got?

## Decision Drivers

* The logged status must be the status sent.
* Every request is logged, whatever stage of the pipeline refused it.
* One line per request, written in one place, the same in `main.ts` and the
  Vercel function.

## Considered Options

* Fix the interceptor: work out the status from the thrown error
* Log from the exception filter for failures and from the interceptor for successes
* Log from Fastify's `onRequest` / `onResponse` hooks

## Decision Outcome

Chosen option: **Fastify hooks** (`apps/api/src/lib/request-log.ts`, registered
in `createApp()` before Nest adds any route). `onRequest` assigns the request id:
the caller's `x-request-id` if it is 1–128 characters of `A-Z a-z 0-9 . _ : -`,
otherwise a new UUID. It also echoes the id in the response. `onResponse` writes
the line after the response has been sent, with `reply.statusCode` and
`reply.elapsedTime`. The interceptor is deleted.

Working out the status from the error would have duplicated the exception
filter's mapping (for example, Prisma error codes to 404/409), and it still
could not see guard refusals. Splitting the logging between the filter and the
interceptor would have kept two writers and the ordering problem.

### Consequences

* Good: the log's status matches the HTTP status, and 401/403/404/429 are now
  visible. Every log line from a request, including the filter's, carries one
  request id.
* Neutral: log volume grows by the requests that were silently dropped before
  (mostly 401s from signed-out pages and 404s).
* Neutral: an SSE stream is still logged once, when it ends.
* Bad: none known.

### Confirmation

* `apps/api/src/lib/request-log.test.ts` builds a real Nest + Fastify app and
  makes real HTTP requests. It checks that 200, 409, 500, a guard's 401, an
  unknown route's 404 and an SSE stream are each logged once with the status
  sent. It also checks that ids are echoed, that a missing id is replaced with a
  new UUID, and that malformed ids are replaced. Against the old interceptor,
  five of the seven cases failed.
* Local check through the web proxy: a duplicate stage update was answered 409
  and logged 409 with the user id. A signed-out `GET /admin/orders` was answered
  401 and logged 401.
