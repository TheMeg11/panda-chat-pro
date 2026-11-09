import { getCurrentUser } from "@/lib/auth";
import { searchGifs } from "@/lib/giphy";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

/**
 * GIF picker search — authenticated users only (guests get 401). Results are
 * proxied through /api/gifs/media/<id>, so giphy.com never touches the browser
 * directly and the CSP stays strict.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
  if (!rateLimit(`gifsearch:${user.id}`, 20, 60_000).ok) {
    return Response.json({ error: "rateLimited" }, { status: 429, headers: { "cache-control": "no-store" } });
  }

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < 1 || q.length > 60) {
    return Response.json({ error: "invalidInput" }, { status: 400, headers: { "cache-control": "no-store" } });
  }

  try {
    const gifs = await searchGifs(q, 16);
    return Response.json({ gifs }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[panda-chat] gif search failed", error);
    return Response.json({ error: "network" }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
