import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Rate limiting.
 *
 * Two tiers:
 *  1. In-memory fixed window (L1) — instant, per instance.
 *  2. Postgres-backed shared buckets (L2, table `rate_limit_buckets`) — counts
 *     are shared by EVERY instance, so a multi-replica deployment cannot be
 *     bypassed by request rotation. Uses a single atomic UPSERT.
 *
 * The in-memory tier is kept as a fast-fail layer and graceful fallback when
 * the database is unreachable (e.g. during boot). The distributed tier is
 * enabled automatically once the table exists; failures degrade to memory-only
 * instead of taking requests down with them.
 */

type Bucket = { count: number; reset: number };

const g = globalThis as typeof globalThis & {
  __pcRateLimit?: Map<string, Bucket>;
  __pcRateLimitDistributed?: boolean | null; // null = probe not done yet
};

const store: Map<string, Bucket> = g.__pcRateLimit ?? (g.__pcRateLimit = new Map());

export type LimitResult = { ok: boolean; retryAfter: number };

/** Fixed-window in-memory limiter (per server instance). */
export function rateLimit(key: string, limit: number, windowMs: number): LimitResult {
  const now = Date.now();
  if (store.size > 5000) {
    for (const [k, b] of store) if (b.reset < now) store.delete(k);
  }
  const bucket = store.get(key);
  if (!bucket || bucket.reset < now) {
    store.set(key, { count: 1, reset: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  bucket.count += 1;
  if (bucket.count > limit) return { ok: false, retryAfter: Math.ceil((bucket.reset - now) / 1000) };
  return { ok: true, retryAfter: 0 };
}

export function clearRateLimit(key: string) {
  store.delete(key);
}

/* ------------------------------------------------------------------ */
/* Distributed (Postgres) limiter                                      */
/* ------------------------------------------------------------------ */

const KEY_RE = /^[a-zA-Z0-9:_\-.]{1,190}$/;

async function probeDistributed(): Promise<boolean> {
  if (g.__pcRateLimitDistributed !== null && g.__pcRateLimitDistributed !== undefined) {
    return g.__pcRateLimitDistributed;
  }
  try {
    await db.execute(sql`select 1 from rate_limit_buckets limit 1`);
    g.__pcRateLimitDistributed = true;
  } catch {
    g.__pcRateLimitDistributed = false;
  }
  return g.__pcRateLimitDistributed;
}

/** Re-probe after a migration ran (used by the migrate script / tests). */
export function resetDistributedProbe() {
  g.__pcRateLimitDistributed = null;
}

/**
 * Distributed fixed-window limiter: memory first (cheap reject), then one
 * atomic upsert that counts across all instances.
 */
export async function rateLimitDistributed(key: string, limit: number, windowMs: number): Promise<LimitResult> {
  const memory = rateLimit(key, limit, windowMs);
  if (!memory.ok) return memory;
  if (!KEY_RE.test(key)) return memory; // keep the table clean of junk keys

  try {
    if (!(await probeDistributed())) return memory;
    const rows = await db.execute<{ count: number; reset_at: string | number; bumped: boolean }>(sql`
      insert into rate_limit_buckets (bucket_key, count, reset_at)
      values (${key}, 1, ${Date.now() + windowMs})
      on conflict (bucket_key) do update set
        count = case when rate_limit_buckets.reset_at < ${Date.now()} then 1 else rate_limit_buckets.count + 1 end,
        reset_at = case when rate_limit_buckets.reset_at < ${Date.now()} then ${Date.now() + windowMs} else rate_limit_buckets.reset_at end
      returning count, reset_at
    `);
    const row = (rows.rows?.[0] ?? undefined) as { count: number; reset_at: string | number } | undefined;
    if (!row) return memory;
    if (Number(row.count) > limit) {
      const resetAt = Number(row.reset_at);
      return { ok: false, retryAfter: Math.max(1, Math.ceil((resetAt - Date.now()) / 1000)) };
    }
    return { ok: true, retryAfter: 0 };
  } catch {
    // DB hiccup: the in-memory verdict already stands.
    return memory;
  }
}

/** Maintenance helper: drop expired shared buckets (called by the loop). */
export async function sweepRateLimitBuckets(): Promise<number> {
  try {
    const res = await db.execute(sql`delete from rate_limit_buckets where reset_at < ${Date.now()}`);
    return res.rowCount ?? 0;
  } catch {
    return 0;
  }
}
