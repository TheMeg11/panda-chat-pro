import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

const USERNAME_RE = /^[a-zA-Z0-9._]{2,32}$/;

/**
 * Exact username lookup for starting a 1:1 chat.
 *
 * Privacy notes:
 *  - Only EXACT matches are returned (no prefix/partial enumeration).
 *  - Suspended accounts are invisible.
 *  - Self matches return null — you cannot DM yourself.
 *  - Requires a session and is rate-limited per account.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401, headers: { "cache-control": "no-store" } });
  const settings = await getSettings();
  if (settings.maintenanceMode) return Response.json({ error: "maintenance" }, { status: 503, headers: { "cache-control": "no-store" } });
  if (!rateLimit(`usearch:${user.id}`, 20, 30_000).ok) {
    return Response.json({ error: "rateLimited" }, { status: 429, headers: { "cache-control": "no-store" } });
  }

  const raw = new URL(req.url).searchParams.get("q") ?? "";
  const q = raw.trim().replace(/^@+/, "");
  if (!USERNAME_RE.test(q)) return Response.json({ user: null }, { headers: { "cache-control": "no-store" } });

  // Exact (case-insensitive) match — no prefix/partial search, nothing is enumerated.
  const [found] = await db
    .select({ username: users.username, displayName: users.displayName })
    .from(users)
    .where(and(eq(users.status, "active"), sql`lower(${users.username}) = ${q.toLowerCase()}`))
    .limit(1);

  if (!found || found.username === user.username) {
    return Response.json({ user: null }, { headers: { "cache-control": "no-store" } });
  }
  return Response.json({ user: found }, { headers: { "cache-control": "no-store" } });
}
