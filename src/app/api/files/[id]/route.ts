import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { files, rooms } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { asciiFallbackName, INLINE_MIMES } from "@/lib/file-mime";
import { getAccessibleRoom, resolveGuestAccess } from "@/lib/rooms";
import { isUuid } from "@/lib/utils";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Serves an uploaded file to people who may see the room anyway:
 * the room owner (session) or an active member who passed the room password gate.
 * Expired media answers 410 and is removed on sight.
 */
export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });

  const [row] = await db
    .select({ file: files, room: rooms })
    .from(files)
    .innerJoin(rooms, eq(rooms.id, files.roomId))
    .where(eq(files.id, id))
    .limit(1);
  if (!row) return new Response("Not found", { status: 404 });
  if (row.file.expiresAt.getTime() <= Date.now()) {
    await db.delete(files).where(and(eq(files.id, id), eq(files.roomId, row.file.roomId))).catch(() => undefined);
    return new Response("Expired", { status: 410 });
  }

  const user = await getCurrentUser();
  if (!user || user.id !== row.room.ownerId) {
    // v2.5.1 (voice fix): a logged-in member must be granted by ACCOUNT too.
    // DM peer rows are keyed `owner:<userId>` (dmDeviceHash) — no browser
    // device cookie can ever match them, so resolveGuestAccess alone answered
    // 403 for the DM recipient: the voice chip arrived but the audio bytes
    // never loaded ("the voice plays empty"). Same rule as the messages API:
    // account-linked membership (DM peer, logged-in join) counts.
    const allowed = user ? Boolean(await getAccessibleRoom(user.id, row.room.id)) : false;
    if (!allowed) {
      const access = await resolveGuestAccess(row.room);
      if (access.state !== "chat") return new Response("Forbidden", { status: 403 });
    }
  }

  const inline = INLINE_MIMES.has(row.file.mime);
  const bytes = new Uint8Array(row.file.data);
  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": row.file.mime,
      "content-length": String(bytes.byteLength),
      "content-disposition": `${inline ? "inline" : "attachment"}; filename="${asciiFallbackName(row.file.name)}"; filename*=UTF-8''${encodeURIComponent(row.file.name)}`,
      "cache-control": "private, max-age=600",
      "x-content-type-options": "nosniff",
    },
  });
}
