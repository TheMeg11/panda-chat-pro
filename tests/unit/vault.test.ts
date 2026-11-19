import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { hashPassword, verifyPassword } from "@/lib/crypto";

const ROOT = join(import.meta.dirname, "..", "..");

/**
 * v2.2.0 — the hidden-chats vault moved from device-local localStorage to the
 * server (`hidden_rooms` table + `users.hidden_pin_hash`). These tests guard
 * the migration surface: every deploy path (fresh init.sql, idempotent
 * db-migrate) must create the new state layer, and the PIN hashing round-trip
 * must be the same scrypt scheme the account password uses.
 */
describe("server-side hidden-chats vault", () => {
  it("init.sql creates hidden_rooms + users.hidden_pin_hash", async () => {
    const sql = await readFile(join(ROOT, "sql", "init.sql"), "utf8");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS hidden_rooms");
    expect(sql).toContain("hidden_pin_hash");
    expect(sql).toContain("PRIMARY KEY (user_id, room_id)");
  });

  it("db-migrate creates hidden_rooms + users.hidden_pin_hash idempotently", async () => {
    const src = await readFile(join(ROOT, "scripts", "db-migrate.mjs"), "utf8");
    expect(src).toContain("create table if not exists hidden_rooms");
    expect(src).toContain("alter table users add column if not exists hidden_pin_hash");
  });

  it("listDashboardChats excludes hidden rooms server-side", async () => {
    const src = await readFile(join(ROOT, "src", "lib", "rooms.ts"), "utf8");
    expect(src).toContain("not exists (select 1 from hidden_rooms");
  });

  it("vault PIN hashing round-trips (scrypt, same scheme as account passwords)", async () => {
    const hash = await hashPassword("1234");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(await verifyPassword("1234", hash)).toBe(true);
    expect(await verifyPassword("9999", hash)).toBe(false);
    expect(await verifyPassword("1234", null)).toBe(false);
  });
});
