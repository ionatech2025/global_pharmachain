import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Serverless-safe pool ceiling, made explicit rather than left to Prisma's
// implicit num_physical_cpus*2+1 default: the API runs as one function that
// scales out per concurrent request, and each cold container opens its own
// pool against the database — an unbounded per-instance pool risks
// exhausting the database's total connection limit under fan-out. Only
// appends the param if the URL doesn't already carry one (e.g. a Neon
// pooled/pgbouncer endpoint that sets its own), so this can't fight an
// intentional value already in DATABASE_URL.
function pooledDatabaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url || /[?&]connection_limit=/.test(url)) return url;
  return `${url}${url.includes("?") ? "&" : "?"}connection_limit=5&pool_timeout=10`;
}

const datasourceUrl = pooledDatabaseUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(datasourceUrl ? { datasources: { db: { url: datasourceUrl } } } : {}),
    log: process.env.NODE_ENV === "production" ? ["error", "warn"] : ["error", "warn"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// Server-side consumers may use Prisma types/enums directly. Client bundles
// must import enums from @pharmachain/core instead.
export * from "@prisma/client";
