# PharmaChain API — Bun runtime, TypeScript executed directly (no bundling).
# Build from the REPO ROOT:  docker build -f apps/api/Dockerfile -t pharmachain-api .

FROM oven/bun:1 AS install
WORKDIR /app
# Workspace manifests first for layer-cached installs
COPY package.json bun.lock turbo.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/auth/package.json packages/auth/package.json
COPY packages/email/package.json packages/email/package.json
COPY packages/notifications/package.json packages/notifications/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY apps/web/package.json apps/web/package.json
RUN bun install --frozen-lockfile

FROM oven/bun:1 AS build
WORKDIR /app
COPY --from=install /app/node_modules node_modules
COPY . .
# Prisma engines for the runtime image are selected via binaryTargets
# ("debian-openssl-3.0.x") in packages/db/prisma/schema.prisma.
RUN cd packages/db && bunx prisma generate

FROM oven/bun:1-slim AS runtime
WORKDIR /app
# Prisma's query engine needs OpenSSL, absent from the slim base image.
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/package.json package.json
COPY --from=build /app/packages packages
COPY --from=build /app/apps/api apps/api
USER bun
EXPOSE 3001
WORKDIR /app/apps/api
CMD ["bun", "src/main.ts"]
