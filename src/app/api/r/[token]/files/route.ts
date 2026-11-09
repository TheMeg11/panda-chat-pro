import { chatJson, filePost } from "@/lib/chat-api";
import { getRoomByToken, resolveGuestAccess } from "@/lib/rooms";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

/** Guest media upload — access is re-validated on every call. */
export async function POST(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  const settings = await getSettings();
  if (settings.maintenanceMode) return chatJson({ error: "maintenance" }, 503);
  const room = await getRoomByToken(token);
  if (!room) return chatJson({ error: "gone" }, 404);
  if (room.isDisabled) return chatJson({ error: "disabled" }, 403);
  const access = await resolveGuestAccess(room);
  if (access.state !== "chat") return chatJson({ error: access.state }, 403);
  const nickname = access.member.nickname ?? "Guest";
  return filePost(req, room, { memberId: access.member.id, nickname, role: "guest", authorName: nickname });
}
