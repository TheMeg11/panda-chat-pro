import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userAvatars } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { isUuid } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Serves a user's profile avatar to AUTHENTICATED users only (guests get 401).
 * The stored mime was sniffed from magic bytes at upload time, so serving it
 * inline is safe; nosniff keeps browsers from second-guessing the content type.
 */
export async function GET(_req: Request, ctx: Ctx) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Bad request", { status: 400 });

  let row: { mime: string; data: Buffer } | undefined;
  try {
    [row] = await db
      .select({ mime: userAvatars.mime, data: userAvatars.data })
      .from(userAvatars)
      .where(eq(userAvatars.userId, id))
      .limit(1);
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (!row) return new Response("Not found", { status: 404 });

  const bytes = new Uint8Array(row.data);
  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": row.mime,
      "content-length": String(bytes.byteLength),
      "cache-control": "private, max-age=3600",
      "x-content-type-options": "nosniff",
    },
  });
}
