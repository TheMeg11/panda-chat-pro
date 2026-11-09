#!/usr/bin/env node
/**
 * Idempotent production migration runner.
 *
 * Runs before `next start` (npm run prestart) so new columns/tables exist by
 * the time the app boots. Every statement is ADD COLUMN IF NOT EXISTS /
 * CREATE TABLE IF NOT EXISTS — safe to re-run on every deploy, and safe on a
 * fresh database (sql/init.sql already covers the full schema).
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[db-migrate] DATABASE_URL is not set — nothing to do.");
  process.exit(0);
}

const MIGRATIONS = [
  // ---- v1.4.0 (security audit + new features) ----
  `alter table rooms add column if not exists e2ee_enabled boolean not null default false`,
  `alter table rooms add column if not exists default_ttl integer`,
  `alter table messages add column if not exists expires_at timestamptz`,
  `alter table messages add column if not exists encrypted boolean not null default false`,
  `create index if not exists messages_expires_idx on messages (expires_at) where expires_at is not null`,
  `create table if not exists two_factor (
     user_id uuid primary key references users(id) on delete cascade,
     secret_encrypted text not null,
     enabled_at timestamptz,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now()
   )`,
  `create table if not exists recovery_codes (
     id uuid primary key default gen_random_uuid(),
     user_id uuid not null references users(id) on delete cascade,
     code_hash varchar(64) not null,
     used_at timestamptz,
     created_at timestamptz not null default now()
   )`,
  `create index if not exists recovery_codes_user_idx on recovery_codes (user_id)`,
  `create table if not exists user_onboarding (
     user_id uuid primary key references users(id) on delete cascade,
     tutorial_version integer not null default 1,
     status varchar(16) not null default 'pending',
     completed_at timestamptz,
     updated_at timestamptz not null default now()
   )`,
  `create table if not exists e2ee_keys (
     user_id uuid primary key references users(id) on delete cascade,
     public_key_jwk text not null,
     wrapped_private_key text not null,
     kdf_salt varchar(64) not null,
     kdf_iterations integer not null default 310000,
     key_version integer not null default 1,
     created_at timestamptz not null default now(),
     updated_at timestamptz not null default now()
   )`,
  `create table if not exists rate_limit_buckets (
     bucket_key varchar(200) primary key,
     count integer not null default 0,
     reset_at bigint not null
   )`,
  `create index if not exists rate_limit_reset_idx on rate_limit_buckets (reset_at)`,
  `create table if not exists deleted_accounts (
     user_id uuid primary key,
     username varchar(32) not null,
     deleted_at timestamptz not null default now()
   )`,
  `alter table telegram_links add column if not exists fallback_room_id uuid references rooms(id) on delete set null`,
  `alter table telegram_links add column if not exists allow_bot_dm boolean not null default false`,
  // ---- v1.5.0 (profile, unread, offline notify, GIFs, password reset) ----
  `alter table users add column if not exists bio varchar(280)`,
  `create table if not exists password_resets (
     id uuid primary key default gen_random_uuid(),
     user_id uuid not null references users(id) on delete cascade,
     code_hash text not null,
     expires_at timestamptz not null,
     used_at timestamptz,
     attempts integer not null default 0,
     created_at timestamptz not null default now()
   )`,
  `create index if not exists password_resets_user_idx on password_resets (user_id)`,
  `alter table room_members add column if not exists last_read_at timestamptz`,
  `alter table room_members add column if not exists tg_notified_at timestamptz`,
  `alter table messages add column if not exists gif_id varchar(64)`,
  `alter table telegram_links add column if not exists offline_notify boolean not null default false`,
  `create table if not exists user_avatars (
     user_id uuid primary key references users(id) on delete cascade,
     mime varchar(32) not null,
     data bytea not null,
     updated_at timestamptz not null default now()
   )`,
];

async function main() {
  const client = new pg.Client({ connectionString: DATABASE_URL, ssl: /sslmode=require/.test(DATABASE_URL) ? { rejectUnauthorized: false } : undefined });
  await client.connect();
  try {
    let applied = 0;
    for (const statement of MIGRATIONS) {
      try {
        await client.query(statement);
        applied += 1;
      } catch (error) {
        // Idempotent statements should never fail; if one does (e.g. a column
        // already exists with a different type), log and continue.
        console.warn(`[db-migrate] skipped: ${String(error.message).slice(0, 140)}`);
      }
    }
    console.log(`[db-migrate] done — ${applied}/${MIGRATIONS.length} statements applied`);
    if (process.env.MIGRATE_INIT_TOO === "1") {
      const initSql = await readFile(join(root, "sql", "init.sql"), "utf8");
      await client.query(initSql);
      console.log("[db-migrate] sql/init.sql replayed (idempotent)");
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error("[db-migrate] failed:", error.message);
  process.exit(1);
});
