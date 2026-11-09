import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * During `next build` no database is reachable — every page is force-dynamic, so the
 * pool is only created to satisfy module-level imports and never queried. A placeholder
 * URL keeps the build happy; any real query would still fail loudly.
 */
const databaseUrl =
  process.env.DATABASE_URL ||
  (process.env.NEXT_PHASE === "phase-production-build"
    ? "postgresql://panda-build:panda-build@127.0.0.1:5432/panda-build"
    : "");

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
    // Keep the footprint small on managed single-instance Postgres.
    max: Math.min(20, Math.max(2, Number(process.env.PG_POOL_MAX) || 10)),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    statement_timeout: 30_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
