#!/usr/bin/env bash
# Single-deployment Vercel release: builds the web app, assembles the NestJS
# API as one serverless function under /api/backend, and deploys both as ONE
# project. Run from anywhere; needs the Vercel CLI authenticated and the
# project linked (vercel link --project pharmachain). See README "Deployment".
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "== 1. Build the API serverless bundle =="
cd apps/api
EXT="--external @prisma/client --external @node-rs/argon2 --external @nestjs/microservices --external @nestjs/websockets --external @nestjs/platform-express --external class-validator --external class-transformer --external @fastify/view --external @fastify/static --external @apollo/server --external @as-integrations/fastify"
rm -rf api && mkdir -p api
bun build src/serverless.ts --outfile api/index.cjs --target node --format cjs $EXT >/dev/null 2>&1
echo "   bundle: $(du -h api/index.cjs | cut -f1)"
cd "$ROOT"

echo "== 2. Point the project at apps/web =="
python3 - <<'PY'
import json, os
p = "apps/web/.vercel/project.json"
d = json.load(open(p))
d.setdefault("settings", {})
d["settings"]["rootDirectory"] = "apps/web"
d["settings"]["framework"] = "nextjs"
os.makedirs(".vercel", exist_ok=True)
json.dump(d, open(".vercel/project.json", "w"), indent=2)
print("   project", d["projectId"])
PY

echo "== 3. vercel build (web) =="
rm -rf .vercel/output apps/web/.next apps/web/.vercel/output
vercel build --prod >/tmp/vb.log 2>&1 || { tail -20 /tmp/vb.log; exit 1; }
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
cat > "$FUNC/.vc-config.json" <<'JSON'
{
  "runtime": "nodejs20.x",
  "handler": "index.cjs",
  "launcherType": "Nodejs",
  "shouldAddHelpers": false,
  "maxDuration": 60
}
JSON
echo "   func: $(du -sh "$FUNC" | cut -f1)"

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
vercel deploy --prebuilt --prod 2>&1 | tee /tmp/vd.log | grep -E 'Production|Aliased|Error' || true
