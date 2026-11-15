import { fetchGifMedia, GIF_ID_RE } from "@/lib/giphy";
import { rateLimit } from "@/lib/rate-limit";
import { metaFromHeaders } from "@/lib/request";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Streams the original Giphy GIF through the server (CSP-safe: the browser only
 * ever talks to this origin — img-src stays 'self'). Open to EVERYONE, including
 * guests: Giphy content is public, and guests have no session to authenticate
 * with, yet they must still see GIFs sent in rooms. The id is charset-validated
 * before it is ever interpolated into an upstream URL, the upstream
 * content-type must be image/gif, and nosniff pins the type on our side.
 * Anonymous traffic is throttled per-IP instead of per-user.
 */
export async function GET(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!GIF_ID_RE.test(id)) return new Response("Bad request", { status: 400 });

  const ip = metaFromHeaders(req.headers).ip;
  // 60/min/IP: each request proxies up to 10 MB — a full picker page (16
  // previews) costs ~16 requests, so legit usage fits comfortably while an
  // open-proxy bandwidth abuser is capped at ~600 MB/min worst case.
  if (!rateLimit(`gifmedia:${ip}`, 60, 60_000).ok) return new Response("Too many requests", { status: 429 });

  let media: Awaited<ReturnType<typeof fetchGifMedia>>;
  try {
    media = await fetchGifMedia(id, new URL(req.url).searchParams.get("variant") === "small" ? "small" : undefined);
  } catch (error) {
    console.error("[panda-chat] gif media failed", error);
    return new Response("Not found", { status: 404 });
  }

  return new Response(media.stream, {
    status: 200,
    headers: {
      "content-type": media.contentType,
      "cache-control": "public, max-age=86400, immutable",
      "x-content-type-options": "nosniff",
    },
  });
}
