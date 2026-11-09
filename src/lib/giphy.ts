import { eq } from "drizzle-orm";
import { db } from "@/db";
import { platformSettings } from "@/db/schema";

/**
 * Giphy integration — search + media PROXY.
 *
 * GIF bytes are never served to the browser straight from giphy.com: the client
 * renders them through /api/gifs/media/<id> (same-origin, CSP-safe). The API
 * key comes from the GIPHY_API_KEY env var or the platform_settings override
 * (`pc_giphy_key`, set by the Super Admin). There is no keyless fallback: when
 * no key is configured, search degrades gracefully with an actionable
 * "unconfigured" reason instead of a generic error.
 */

const SETTINGS_KEY = "pc_giphy_key";

/** Giphy media ids: letters, digits, dash, underscore. */
export const GIF_ID_RE = /^[A-Za-z0-9_-]{3,64}$/;

const g = globalThis as typeof globalThis & {
  __pcGiphyKey?: { value: string | null; at: number };
  __pcGiphyCache?: Map<string, { at: number; gifs: GifThumb[] }>;
};

export type GifThumb = { id: string; title: string };

/** Typed search outcome — each failure reason maps to a specific, actionable
 * message in the picker instead of a generic "couldn't load" error. */
export type GifSearchResult =
  | { ok: true; gifs: GifThumb[] }
  | { ok: false; reason: "unconfigured" | "invalid-key" | "network" };

/** Resolves the active Giphy API key (env → platform settings → null). */
export async function giphyKey(): Promise<string | null> {
  const env = process.env.GIPHY_API_KEY?.trim();
  if (env) return env;
  const cached = g.__pcGiphyKey;
  if (cached && Date.now() - cached.at < 30_000) return cached.value;
  let value: string | null = null;
  try {
    const [row] = await db.select().from(platformSettings).where(eq(platformSettings.key, SETTINGS_KEY)).limit(1);
    const stored = row?.value as { key?: string } | string | undefined;
    const key = typeof stored === "string" ? stored : stored?.key;
    if (typeof key === "string" && key.trim()) value = key.trim();
  } catch {
    /* settings table not ready yet */
  }
  g.__pcGiphyKey = { value, at: Date.now() };
  return value;
}

/** In-memory search cache: 60s TTL, ~100 entries max (ok results only). */
const cache: Map<string, { at: number; gifs: GifThumb[] }> = g.__pcGiphyCache ?? (g.__pcGiphyCache = new Map());
const CACHE_TTL = 60_000;
const CACHE_MAX = 100;

/**
 * Searches Giphy and returns simplified {id, title} thumbnails, or a typed
 * failure: no key configured ("unconfigured"), key rejected with 401/403
 * ("invalid-key"), or timeout / other non-200 / unparsable body
 * ("network"). Only ok results are cached.
 */
export async function searchGifs(q: string, limit = 16): Promise<GifSearchResult> {
  const bounded = Math.min(50, Math.max(1, Math.floor(limit) || 16));
  const key = `${q}\u0000${bounded}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL) return { ok: true, gifs: hit.gifs };

  const apiKey = await giphyKey();
  if (!apiKey) return { ok: false, reason: "unconfigured" };

  const url =
    `https://api.giphy.com/v1/gifs/search?api_key=${encodeURIComponent(apiKey)}` +
    `&q=${encodeURIComponent(q)}&limit=${bounded}&rating=pg&lang=fa`;
  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(8_000), cache: "no-store" });
  } catch {
    /* timeout, DNS, connection refused, … */
    return { ok: false, reason: "network" };
  }
  if (res.status === 401 || res.status === 403) return { ok: false, reason: "invalid-key" };
  if (!res.ok) return { ok: false, reason: "network" };

  let data: { data?: Array<{ id?: string; title?: string }> };
  try {
    data = (await res.json()) as { data?: Array<{ id?: string; title?: string }> };
  } catch {
    /* non-JSON body */
    return { ok: false, reason: "network" };
  }
  const gifs = (data.data ?? [])
    .filter((item) => typeof item.id === "string" && GIF_ID_RE.test(item.id))
    .map((item) => ({
      id: item.id as string,
      title: typeof item.title === "string" ? item.title.slice(0, 200) : "",
    }));

  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(key, { at: Date.now(), gifs });
  return { ok: true, gifs };
}

export type GifMedia = { stream: ReadableStream<Uint8Array>; contentType: string };

/** Hard cap on streamed GIF bytes — applies even when the upstream omits
 *  content-length (chunked transfer) or lies about it. */
const MAX_GIF_BYTES = 10 * 1024 * 1024;

/**
 * Enforces the byte cap while the body streams through: a chunked upstream
 * without content-length would otherwise pass unbounded bytes (and a lying
 * content-length too). The stream errors — and the proxy response aborts —
 * as soon as the cap is exceeded.
 */
function capStream(stream: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  let seen = 0;
  return stream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > MAX_GIF_BYTES) {
          controller.error(new Error("gif too large"));
          return;
        }
        controller.enqueue(chunk);
      },
    }),
  );
}

/**
 * Streams the GIF bytes for a validated Giphy id. Content-type must be
 * image/gif and, when Giphy announces a length, it must stay under 10 MB —
 * and even when it does not (or lies), the stream itself is hard-capped.
 * `variant: "small"` fetches Giphy's downsized rendition (`giphy-downsized.gif`)
 * for picker previews; the default is the original `giphy.gif`.
 */
export async function fetchGifMedia(id: string, variant?: "small"): Promise<GifMedia> {
  if (!GIF_ID_RE.test(id)) throw new Error("invalid gif id");
  const file = variant === "small" ? "giphy-downsized.gif" : "giphy.gif";
  const res = await fetch(`https://media.giphy.com/media/${encodeURIComponent(id)}/${file}`, {
    signal: AbortSignal.timeout(10_000),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`giphy media HTTP ${res.status}`);
  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("image/gif")) throw new Error("not a gif");
  const length = Number(res.headers.get("content-length") ?? 0);
  if (Number.isFinite(length) && length > MAX_GIF_BYTES) throw new Error("gif too large");
  if (!res.body) throw new Error("empty gif body");
  return { stream: capStream(res.body), contentType: "image/gif" };
}
