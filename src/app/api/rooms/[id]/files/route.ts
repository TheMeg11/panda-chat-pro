import { getCurrentUser } from "@/lib/auth";
import { filePost, chatJson } from "@/lib/chat-api";
import { getAccessibleRoom, getOwnerMember } from "@/lib/rooms";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Media upload — same authorization as the chat API (rooms: owner, 1:1 chats: participants). */
export async function POST(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return chatJson({ error: "unauthorized" }, 401);
  const settings = await getSettings();
  if (settings.maintenanceMode) return chatJson({ error: "maintenance" }, 503);
  const room = await getAccessibleRoom(user.id, id);
  if (!room) return chatJson({ error: "gone" }, 404);
  if (room.isDisabled) return chatJson({ error: "disabled" }, 403);
  const member = await getOwnerMember(room, user);
  return filePost(req, room, { memberId: member.id, nickname: user.displayName, role: "owner", authorName: user.displayName });
}
