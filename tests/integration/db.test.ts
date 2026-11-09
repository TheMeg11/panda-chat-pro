import { beforeAll, describe, expect, it } from "vitest";

/**
 * Integration tests — a REAL Postgres is required.
 * Skipped automatically when DATABASE_URL is absent (CI runs it with a service).
 */
const hasDb = Boolean(process.env.DATABASE_URL && /^postgres(ql)?:\/\//.test(process.env.DATABASE_URL));

describe.skipIf(!hasDb)("database integration (schema + migrations)", () => {
  beforeAll(async () => {
    // Ensure the schema exists exactly the way production boots: init.sql + migrations.
    const { execFileSync } = await import("node:child_process");
    try {
      execFileSync("node", ["scripts/db-migrate.mjs"], { env: process.env, stdio: "pipe" });
    } catch {
      // migrate script warns but never throws in practice; the queries below fail loudly instead
    }
  });

  it("creates every new table from the v1.4.0 migration", async () => {
    const pg = (await import("pg")).default;
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const { rows } = await client.query(
      `select table_name from information_schema.tables where table_schema = 'public'`,
    );
    const names = new Set(rows.map((r: { table_name: string }) => r.table_name));
    for (const table of [
      "two_factor",
      "recovery_codes",
      "user_onboarding",
      "e2ee_keys",
      "rate_limit_buckets",
      "deleted_accounts",
    ]) {
      expect(names.has(table), `table ${table} must exist`).toBe(true);
    }
    await client.end();
  });

  it("adds the new columns to existing tables", async () => {
    const pg = (await import("pg")).default;
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    const roomCols = await client.query(`select column_name from information_schema.columns where table_name = 'rooms'`);
    const roomNames = new Set(roomCols.rows.map((r: { column_name: string }) => r.column_name));
    expect(roomNames.has("e2ee_enabled")).toBe(true);
    expect(roomNames.has("default_ttl")).toBe(true);

    const msgCols = await client.query(`select column_name from information_schema.columns where table_name = 'messages'`);
    const msgNames = new Set(msgCols.rows.map((r: { column_name: string }) => r.column_name));
    expect(msgNames.has("expires_at")).toBe(true);
    expect(msgNames.has("encrypted")).toBe(true);

    const linkCols = await client.query(`select column_name from information_schema.columns where table_name = 'telegram_links'`);
    const linkNames = new Set(linkCols.rows.map((r: { column_name: string }) => r.column_name));
    expect(linkNames.has("fallback_room_id")).toBe(true);
    expect(linkNames.has("allow_bot_dm")).toBe(true);
    await client.end();
  });

  it("distributed rate limiter counts across the shared table", async () => {
    const { resetDistributedProbe, rateLimitDistributed } = await import("@/lib/rate-limit");
    resetDistributedProbe();
    const key = `test:${Date.now()}`;
    const first = await rateLimitDistributed(key, 2, 60_000);
    const second = await rateLimitDistributed(key, 2, 60_000);
    const third = await rateLimitDistributed(key, 2, 60_000);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(third.ok).toBe(false);
    expect(third.retryAfter).toBeGreaterThan(0);
    // cleanup
    const pg = (await import("pg")).default;
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    await client.query(`delete from rate_limit_buckets where bucket_key = $1`, [key]);
    await client.end();
  });

  it("migrations are idempotent (safe to re-run)", async () => {
    const { execFileSync } = await import("node:child_process");
    expect(() => {
      execFileSync("node", ["scripts/db-migrate.mjs"], { env: process.env, stdio: "pipe" });
    }).not.toThrow();
  });
});
