#!/usr/bin/env bash
# Single-deployment Vercel release: builds the web app, assembles the NestJS
# API as one serverless function under /api/backend, and deploys both as ONE
# project. Run from anywhere; needs the Vercel CLI authenticated and the
# project linked (vercel link --project pharmachain). See README "Deployment".
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Every Node function — the web app's pages AND the API — runs in ONE region,
# the database's. Neon lives in AWS ap-southeast-1 (Singapore) = Vercel sin1.
# Left at the iad1 default, every query crossed the Pacific (~240ms measured,
# 2026-10-11) and an authenticated page took seconds. Pinning only the API is
# not enough: the page renderer calls the API, so it must sit there too. If
# the database ever moves, move this with it.
REGION="${VERCEL_FUNCTION_REGION:-sin1}"
# Vercel stopped accepting Node 20 for new deployments on 2026-10-01.
API_RUNTIME="nodejs24.x"
# The public origin baked into statically generated output — the landing
# page's canonical/OG URLs, sitemap.xml, robots.txt. A local `vercel build`
# does not see Vercel's system variables, so without this the static pages
# fell back to http://localhost:3000. Step 4c refuses to release if it leaks.
# The client's own domain is canonical (2026-10-30): canonical URLs, the sitemap,
# robots and social cards name it. The vercel.app host still serves the same build.
export NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL:-https://www.pharmachainglobal.com}"
if command -v vercel >/dev/null 2>&1; then
  VERCEL_CMD=(vercel)
else
  VERCEL_CMD=(bunx vercel@58.7.1)
fi

echo "== 1. Build the API serverless bundle =="
if [ ! -d node_modules/.prisma/client ]; then
  bun run db:generate >/tmp/db-gen.log 2>&1 \
    || { echo "   PRISMA GENERATE FAILED:"; tail -20 /tmp/db-gen.log | sed 's/^/     /'; exit 1; }
fi
cd apps/api
EXT="--external @prisma/client --external @node-rs/argon2 --external nodemailer --external @nestjs/microservices --external @nestjs/websockets --external @nestjs/platform-express --external class-validator --external class-transformer --external @fastify/view --external @fastify/static --external @apollo/server --external @as-integrations/fastify"
rm -rf api && mkdir -p api
# bun build constant-folds process.env.NODE_ENV; without this define it bakes
# in "development", so a production-only branch written that way never runs.
bun build src/serverless.ts --outfile api/index.cjs --target node --format cjs \
  --define 'process.env.NODE_ENV="production"' $EXT >/tmp/api-build.log 2>&1 \
  || { echo "   API BUILD FAILED:"; tail -30 /tmp/api-build.log | sed 's/^/     /'; exit 1; }
echo "   bundle: $(du -h api/index.cjs | cut -f1)"
cd "$ROOT"

echo "== 2. Point the project at apps/web =="
python3 - <<'PY'
import json, os
p = "apps/web/.vercel/project.json"
if os.path.exists(p):
    d = json.load(open(p))
else:
    d = {
        "projectId": os.environ.get("VERCEL_PROJECT_ID", "prj_NGQTZoO7rPRF9YsPylYuITnmrWnI"),
        "orgId": os.environ.get("VERCEL_ORG_ID", "team_6scESWZ4tyV13XFGBnliQEBC"),
        "projectName": "global-pharmachain",
    }
d.setdefault("settings", {})
d["settings"]["rootDirectory"] = "apps/web"
d["settings"]["framework"] = "nextjs"
os.makedirs(".vercel", exist_ok=True)
json.dump(d, open(".vercel/project.json", "w"), indent=2)
os.makedirs("apps/web/.vercel", exist_ok=True)
if not os.path.exists(p):
    json.dump(
        {k: d[k] for k in ("projectId", "orgId", "projectName") if k in d},
        open(p, "w"),
    )
print("   project", d["projectId"])
PY

echo "== 3. vercel build (web) =="
rm -rf .vercel/output apps/web/.next apps/web/.vercel/output
"${VERCEL_CMD[@]}" build --prod --yes >/tmp/vb.log 2>&1 || { tail -20 /tmp/vb.log; exit 1; }
echo "   output: $(ls .vercel/output/functions | wc -l) functions"

echo "== 4. Assemble the API function =="
FUNC=".vercel/output/functions/api/backend.func"
rm -rf "$FUNC"; mkdir -p "$FUNC/node_modules/@prisma" "$FUNC/node_modules/.prisma" "$FUNC/node_modules/@node-rs"
cp apps/api/api/index.cjs "$FUNC/index.cjs"
cp -r node_modules/@prisma/client "$FUNC/node_modules/@prisma/client"
cp -r node_modules/.prisma/client "$FUNC/node_modules/.prisma/client"
# Keep only the Vercel (rhel) Prisma engine to cut upload size
rm -f "$FUNC/node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node"
cp -r node_modules/@node-rs/argon2 "$FUNC/node_modules/@node-rs/argon2"
cp -r node_modules/@node-rs/argon2-linux-x64-gnu "$FUNC/node_modules/@node-rs/argon2-linux-x64-gnu"
# SMTP transport: left unbundled (it resolves its own internals at runtime) and
# shipped whole — it has no dependencies of its own.
cp -r node_modules/nodemailer "$FUNC/node_modules/nodemailer"
# supportsResponseStreaming: without it the platform buffers the whole
# response, so the messaging SSE stream delivered nothing until it closed.
API_RUNTIME="$API_RUNTIME" REGION="$REGION" FUNC="$FUNC" python3 - <<'PY'
import json, os
config = {
    "runtime": os.environ["API_RUNTIME"],
    "handler": "index.cjs",
    "launcherType": "Nodejs",
    "shouldAddHelpers": False,
    "supportsResponseStreaming": True,
    "maxDuration": 60,
    "regions": [os.environ["REGION"]],
}
json.dump(config, open(os.path.join(os.environ["FUNC"], ".vc-config.json"), "w"), indent=2)
PY
echo "   func: $(du -sh "$FUNC" | cut -f1)"

echo "== 4b. Pin every Node function to $REGION ($API_RUNTIME) =="
REGION="$REGION" API_RUNTIME="$API_RUNTIME" python3 - <<'PY'
import glob, json, os, sys
region = os.environ["REGION"]
runtime = os.environ["API_RUNTIME"]
pinned = skipped = 0
for path in glob.glob(".vercel/output/functions/**/.vc-config.json", recursive=True):
    cfg = json.load(open(path))
    if not str(cfg.get("runtime", "")).startswith("nodejs"):
        skipped += 1  # the edge middleware runs everywhere by design
        continue
    if cfg.get("regions") != [region] or cfg.get("runtime") != runtime:
        cfg["regions"] = [region]
        cfg["runtime"] = runtime
        json.dump(cfg, open(path, "w"), indent=2)
    pinned += 1
# Fail closed: a release with any Node function outside the region, or on a
# runtime Vercel no longer deploys, must not go out.
bad = []
for path in glob.glob(".vercel/output/functions/**/.vc-config.json", recursive=True):
    cfg = json.load(open(path))
    if str(cfg.get("runtime", "")).startswith("nodejs") and (
        cfg.get("regions") != [region] or cfg.get("runtime") != runtime
    ):
        bad.append(path)
api = json.load(open(".vercel/output/functions/api/backend.func/.vc-config.json"))
if api.get("runtime") != runtime or not api.get("supportsResponseStreaming"):
    bad.append("api/backend.func (runtime/streaming)")
if bad:
    print("   REGION/RUNTIME CHECK FAILED:", *bad[:10], sep="\n     ")
    sys.exit(1)
print(f"   pinned {pinned} Node function(s) to {region} ({runtime}); {skipped} edge function(s) left global")
PY

echo "== 4c. No development origin in the built output =="
# Prerendered HTML/RSC, sitemap.xml and robots.txt are fixed at build time;
# a localhost origin in them is broken share cards and a wrong canonical URL
# on production. Grep the generated artefacts, not the bundled server code.
leaks=$(grep -rIl --include='*.html' --include='*.rsc' --include='*.xml' --include='*.txt' \
  --include='*.body' --include='*.meta' 'http://localhost:3000' .vercel/output 2>/dev/null | head -5 || true)
if [ -n "$leaks" ]; then
  echo "   LOCALHOST ORIGIN IN BUILT OUTPUT — refusing to release:"
  echo "$leaks" | sed 's/^/     /'
  exit 1
fi
echo "   none (public origin: $NEXT_PUBLIC_SITE_URL)"

echo "== 5. Route /api/backend/* to the function =="
python3 - <<'PY'
import json
p = ".vercel/output/config.json"
cfg = json.load(open(p))
routes = cfg.get("routes", [])
route = {"src": "^/api/backend(?:/.*)?$", "dest": "/api/backend"}
if route not in routes:
    routes.insert(0, route)
cfg["routes"] = routes
json.dump(cfg, open(p, "w"), indent=2)
print("   routes now:", len(routes))
PY

echo "== 6. Deploy =="
# `| grep ... || true` used to swallow the outcome: a failed upload still left
# the script exiting 0, so a deploy that never landed looked like a success.
# Take vercel's own status from PIPESTATUS and fail loudly on it.
set +e
"${VERCEL_CMD[@]}" deploy --prebuilt --prod --archive=tgz --yes 2>&1 | tee /tmp/vd.log
status=${PIPESTATUS[0]}
set -e
grep -E 'Production|Aliased' /tmp/vd.log || true
if [ "$status" -ne 0 ]; then
  echo "   DEPLOY FAILED (vercel exit $status) — nothing was released:"
  tail -20 /tmp/vd.log | sed 's/^/     /'
  exit "$status"
fi
echo "   released"
