import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Boot-time schema self-heal (v1.5.2).
 *
 * Incident 2026-11-14: the Railway service was redeployed WITHOUT its
 * `preDeployCommand` (db-init.mjs), so sql/init.sql never ran against the
 * runtime database. Every DB-backed route returned `42P01 relation
 * "platform_settings" does not exist` and /api/health answered 503
 * schema-missing — a freshly re-created Postgres had wiped the tables too.
 *
 * Defensive fix: on every server boot, BEFORE the poller/maintenance loops
 * start, check that the base schema exists (platform_settings is created by
 * init.sql and never dropped). If it is missing, apply sql/init.sql (fully
 * idempotent: CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS) and then
 * the incremental migrations from scripts/db-migrate.mjs. This makes the app
 * recover by itself no matter how Railway is configured — while a healthy
 * database adds only one trivial `select 1 ... limit 1` round-trip at boot.
 */

const BASELINE_TABLES = ["users", "rooms", "messages", "platform_settings"] as const;

export async function ensureSchema(): Promise<"ok" | "applied" | "failed"> {
  const g = globalThis as typeof globalThis & { __pcSchemaHealed?: boolean };
  if (g.__pcSchemaHealed) return "ok";
  g.__pcSchemaHealed = true;

  try {
    // One cheap probe: the baseline table init.sql creates and every code path
    // touches first. Present → schema already applied, nothing to do.
    await db.execute(sql`select 1 from platform_settings limit 1`);
    return "ok";
  } catch {
    // 42P01 (missing relation) or connectivity trouble — apply the DDL below.
  }

  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const initSql = await readFile(join(here, "..", "..", "sql", "init.sql"), "utf8");
    await db.execute(sql.raw(initSql));
    // Reuse the incremental migration statements (newer columns/tables not
    // yet part of init.sql) — they are all IF NOT EXISTS, so a fresh schema
    // and an old one both converge to the current shape.
    const { applyMigrations } = await import("../../scripts/db-migrate.mjs");
    await applyMigrations((statement: string) => db.execute(sql.raw(statement)));
    const res = await db.execute(
      sql`select count(*)::int as n from information_schema.tables where table_schema = 'public'`,
    );
    const tables = (res.rows as Array<{ n: number }>)[0]?.n ?? 0;
    for (const t of BASELINE_TABLES) {
      await db.execute(sql.raw(`select 1 from ${t} limit 1`));
    }
    console.log(`[panda-chat] schema self-heal applied — database ready (${tables} public tables)`);
    return "applied";
  } catch (error) {
    delete g.__pcSchemaHealed;
    console.error("[panda-chat] schema self-heal FAILED:", error instanceof Error ? error.message : error);
    return "failed";
  }
}
