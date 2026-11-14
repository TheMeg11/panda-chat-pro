import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for the v1.5.2 boot-time schema self-heal.
 *
 * The heal must:
 *  - return "ok" immediately when the baseline probe succeeds (healthy DB),
 *  - apply sql/init.sql + every migration when platform_settings is missing,
 *  - verify the baseline tables afterwards,
 *  - return "failed" (and clear the latch so the next boot retries) when the
 *    DDL itself fails.
 */

type Query = { sql: string };

type Step = { match: RegExp; result?: () => unknown; error?: Error; once?: boolean };

function fakeDb(script: Step[]) {
  const executed: Query[] = [];
  const fired = new Set<Step>();
  const execute = vi.fn(async (raw: unknown) => {
    // Both sql`...` templates and sql.raw(...) build { queryChunks: [{ value: ["..."] }] };
    // a plain string is passed through as-is.
    const holder = raw as { queryChunks?: Array<{ value?: string[] }> };
    const text = typeof raw === "string"
      ? raw
      : String(holder.queryChunks?.map((c) => Array.isArray(c.value) ? c.value.join("") : "").join("") ?? "");
    executed.push({ sql: text });
    for (const step of script) {
      if (step.match.test(text)) {
        if (step.once) {
          if (fired.has(step)) continue;
          fired.add(step);
        }
        if (step.error) throw step.error;
        return step.result ? step.result() : { rows: [] };
      }
    }
    return { rows: [] };
  });
  return { execute, executed };
}

const g = globalThis as typeof globalThis & { __pcSchemaHealed?: boolean };

beforeEach(() => {
  delete g.__pcSchemaHealed;
});

afterEach(() => {
  delete g.__pcSchemaHealed;
  vi.resetModules();
  vi.unmock("pg");
});

async function loadHeal(db: ReturnType<typeof fakeDb>) {
  vi.doMock("@/db", () => ({ db }));
  vi.doMock("fs/promises", () => ({
    readFile: async () => "CREATE TABLE IF NOT EXISTS users (id uuid);",
  }));
  const mod = await import("@/lib/schema-heal");
  return mod;
}

describe("schema self-heal (v1.5.2)", () => {
  it("does nothing when the baseline table already exists", async () => {
    const db = fakeDb([{ match: /platform_settings/ }]);
    const { ensureSchema } = await loadHeal(db);
    const result = await ensureSchema();
    expect(result).toBe("ok");
    expect(db.executed).toHaveLength(1);
    expect(db.executed[0].sql).toMatch(/platform_settings/);
    expect(g.__pcSchemaHealed).toBe(true);
  });

  it("applies init.sql + migrations when the schema is missing", async () => {
    const missing = new Error('relation "platform_settings" does not exist');
    let thrownOnce = false;
    const db = fakeDb([
      // only the FIRST platform_settings probe fails — after the DDL runs the
      // verification probe at the end must succeed.
      {
        match: /from platform_settings limit 1/,
        error: missing,
        once: true,
      },
      { match: /information_schema\.tables/, result: () => ({ rows: [{ n: 20 }] }) },
    ]);
    const { ensureSchema } = await loadHeal(db);
    const result = await ensureSchema();
    expect(result).toBe("applied");
    const texts = db.executed.map((q) => q.sql);
    expect(texts.some((t) => /CREATE TABLE IF NOT EXISTS users/i.test(t))).toBe(true);
    // baseline verification probes ran
    for (const table of ["users", "rooms", "messages", "platform_settings"]) {
      expect(texts.some((t) => t.includes(`from ${table} limit 1`))).toBe(true);
    }
  });

  it("returns failed and clears the latch when the DDL fails", async () => {
    const missing = new Error('relation "platform_settings" does not exist');
    const boom = new Error("connection refused");
    const db = fakeDb([
      { match: /from platform_settings limit 1/, error: missing },
      { match: /CREATE TABLE/i, error: boom },
    ]);
    const { ensureSchema } = await loadHeal(db);
    const result = await ensureSchema();
    expect(result).toBe("failed");
    expect(g.__pcSchemaHealed).toBeUndefined();
  });

  it("runs only once per process even if called twice", async () => {
    const db = fakeDb([{ match: /platform_settings/ }]);
    const { ensureSchema } = await loadHeal(db);
    await ensureSchema();
    const again = await ensureSchema();
    expect(again).toBe("ok");
    expect(db.execute).toHaveBeenCalledTimes(1);
  });
});
