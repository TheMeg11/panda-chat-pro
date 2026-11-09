type Bucket = { count: number; reset: number };

const g = globalThis as typeof globalThis & { __pcRateLimit?: Map<string, Bucket> };
const store: Map<string, Bucket> = g.__pcRateLimit ?? (g.__pcRateLimit = new Map());

/** Fixed-window in-memory limiter (per server instance). */
export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfter: number } {
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
