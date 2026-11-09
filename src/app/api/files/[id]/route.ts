import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { files, rooms } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { asciiFallbackName, INLINE_MIMES } from "@/lib/file-mime";
import { resolveGuestAccess } from "@/lib/rooms";
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
    const access = await resolveGuestAccess(row.room);
    if (access.state !== "chat") return new Response("Forbidden", { status: 403 });
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
