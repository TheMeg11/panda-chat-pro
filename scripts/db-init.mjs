/**
 * One-shot database schema initializer (idempotent).
 *
 * Runs as the service's pre-deploy command, inside Railway's private network,
 * before the app starts. Applies sql/init.sql, which is safe to run repeatedly
 * (CREATE TABLE IF NOT EXISTS) so redeploys never touch existing data.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const sqlPath = join(here, "..", "sql", "init.sql");

if (!process.env.DATABASE_URL) {
  console.error("[anonchat] DATABASE_URL is not set — cannot initialize the database");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });

try {
  await pool.query(readFileSync(sqlPath, "utf8"));
  const { rows } = await pool.query(
    "select count(*)::int as n from information_schema.tables where table_schema = 'public'",
  );
  console.log(`[anonchat] database schema ready (${rows[0].n} public tables)`);
} catch (error) {
  console.error("[anonchat] database initialization failed:", error.message);
  process.exit(1);
} finally {
  await pool.end();
}
