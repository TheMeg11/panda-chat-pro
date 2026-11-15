import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { roomMembers, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { chatDelete, chatGet, chatJson, chatPost } from "@/lib/chat-api";
import type { ChatRoomOverride } from "@/lib/chat";
import { getAccessibleRoom, getEffectiveMember } from "@/lib/rooms";
import { getSettings } from "@/lib/settings";
import { ensurePoller } from "@/lib/telegram/poller";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Chat API — requires the owner's session (rooms) or participation (1:1 chats + joined rooms). */
async function resolve(ctx: Ctx) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return { error: chatJson({ error: "unauthorized" }, 401) };
  const settings = await getSettings();
  if (settings.maintenanceMode) return { error: chatJson({ error: "maintenance" }, 503) };
  const room = await getAccessibleRoom(user.id, id);
  if (!room) return { error: chatJson({ error: "gone" }, 404) };
  if (room.isDisabled) return { error: chatJson({ error: "disabled" }, 403) };
  const member = await getEffectiveMember(room, user);
  const nickname = member.nickname || user.displayName;
  const viewer = {
    memberId: member.id,
    nickname,
    role: member.role === "owner" ? ("owner" as const) : ("guest" as const),
    // The dashboard viewer is authenticated — their read state always advances,
    // even inside a room they JOINED (guest-role membership).
    markRead: true,
    authorName: nickname,
  };
  let override: ChatRoomOverride | undefined;
  if (room.type === "dm") {
    const [peer] = await db
      .select({ username: users.username, displayName: users.displayName })
      .from(roomMembers)
      .innerJoin(users, eq(users.id, roomMembers.userId))
      .where(and(eq(roomMembers.roomId, room.id), eq(roomMembers.role, "owner"), ne(roomMembers.userId, user.id)))
      .limit(1);
    override = {
      name: peer?.displayName ?? room.name,
      subtitle: peer ? `@${peer.username}` : undefined,
      direct: true,
      description: "",
    };
  }
  return { room, viewer, override };
}

export async function GET(req: Request, ctx: Ctx) {
  ensurePoller();
  const r = await resolve(ctx);
  if ("error" in r) return r.error;
  return chatGet(req, r.room, r.viewer, r.override);
}

export async function POST(req: Request, ctx: Ctx) {
  const r = await resolve(ctx);
  if ("error" in r) return r.error;
  return chatPost(req, r.room, r.viewer, r.override);
}

export async function DELETE(req: Request, ctx: Ctx) {
  const r = await resolve(ctx);
  if ("error" in r) return r.error;
  return chatDelete(req, r.room, r.viewer);
}
