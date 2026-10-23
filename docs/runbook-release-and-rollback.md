# Release and rollback runbook

How a release goes out, how to prove it is live, and — the part that is easy to get wrong —
when it can and cannot be undone. Written 2026-10-23 from the releases of 2026-10-11,
-22 and -23. `git push` does **not** deploy this project (`vercel.json` disables git
deployments on purpose); the release is a prebuilt upload.

## 1. Before releasing

```
bun install --frozen-lockfile      # CI fails if the lockfile and manifests disagree
bun run lint && bun run typecheck && bun run test
bun audit                          # nothing critical or high that ships to production
```

`bun audit` earns its place: on 2026-10-23 it found five critical Next.js advisories in
the installed version. Mind the nested copies — `@nestjs/platform-fastify` brings its own
Fastify, so bumping `fastify` alone left the vulnerable copy serving; the root `overrides`
force a single patched version. After changing dependencies, `rm -rf node_modules &&
bun install` and look at the **on-disk** tree, not only the audit output.

Run the e2e suite against a **production build** (never `next dev`: its HMR needs `eval`,
the per-request CSP forbids it, React never hydrates, and every form silently submits as a
GET). See `e2e/README.md`.

## 2. Order of operations

1. **Migrate first, if the release has a migration.** Actions → `db-migrate` → run on the
   release branch with `confirm = migrate`. The log prints `prisma migrate status` before
   and after (host masked). Migrations here are additive and idempotent.
   *Why first:* code that names a new column or enum value fails on a database that lacks
   it — the admin companies list compared against `DELETED` and would have returned 500s.
2. **Deploy:** `scripts/deploy-vercel.sh`. It fails closed (functions pinned to `sin1`,
   `nodejs24.x`, response streaming). On this machine the upload sometimes dies with
   `fetch failed` — see `ipv6-blackhole` notes: force IPv4 and retry; a retry can leave a
   duplicate, unaliased deployment (harmless).
3. **Verify it is genuinely live** — a 200 proves nothing, a stale deploy returns 200:
   * `vercel ls --prod` — newest deployment is `Ready`; `vercel inspect <alias>` names it,
     target `production`, functions in `sin1`;
   * a marker from the change in what is served (an API answer, a CSS token, a string);
   * `vercel logs --environment production --since 25m --json` — no 5xx, no errors. (The
     API log's `status` is the status *before* the error handler runs, so a failed request
     can read `201`; trust Vercel's own request log for the HTTP status.)
   * the production e2e suite (`SEED_DEMO_PASSWORD`, `SEED_SUPER_ADMIN_PASSWORD`).

## 3. Rolling back

**Code** is easy: `vercel rollback <previous-deployment-url>` (or promote it). The previous
production deployment is always the one just below the alias in `vercel ls --prod`.

**The database is forward-only.** PostgreSQL cannot drop an enum value, and an older build
does not know the newer shape. Whether the old code can still run depends on the data:

| Rolling back to a build from before… | Safe only if… | Check |
| --- | --- | --- |
| **2026-10-22** (company suspend / delete) | no company is `SUSPENDED` or `DELETED` — the older Prisma client cannot read those enum values and throws on the row | Admin → Companies → filters **Deactivated** and **Deleted** must both be empty |
| **2026-10-23** (passkeys) | always safe for the code; but the older build ignores passkeys, so a platform admin could sign in with the password alone until the roll-forward | none needed — tell the admins |

Once a company has been suspended or deleted, **fix forward**: ship a corrected build
rather than rolling back.

## 4. Passkeys: operating notes

* A passkey is bound to the **RP ID** (by default the host of `APP_URL`, here
  `global-pharmachain.vercel.app`). It does not work on the alias
  `global-pharmachain-ionas-projects-….vercel.app`, and **moving to a custom domain orphans
  every passkey**. Before that move, set `WEBAUTHN_RP_ID` to the registrable parent domain
  that will outlive the change, and `WEBAUTHN_ORIGINS` to the allowed origins.
* Platform admins who have a passkey **must** use it; a TOTP code is not accepted in its
  place (it can be phished). So: **register at least two** passkeys on different devices,
  and keep a second platform-admin account.
* If an admin loses every passkey, remove the rows in the Neon console (SQL editor):
  `DELETE FROM "WebAuthnCredential" WHERE "userId" = '<user id>';` — they then sign in with
  password only and can enrol again. There is deliberately no in-app back door.

## 5. Decisions on record

* **`middleware` stays for now.** Next.js 16 renames it `proxy` and defaults it to the
  Node.js runtime. Here the landing-page redirect runs at the edge; as a Node function
  pinned to `sin1` it would add a round trip to Singapore to every visit to `/`. Revisit
  when Next removes `middleware`, or after measuring `proxy` from East Africa.
* **Password policy follows NIST SP 800-63B-4** (see `packages/core/src/password-policy.ts`):
  15-character floor, 128 accepted, no composition rules, whole-password blocklist plus a
  Pwned Passwords lookup that fails open, NFC normalisation, no forced rotation. Existing
  passwords are not invalidated; the new rules apply when one is next set.
