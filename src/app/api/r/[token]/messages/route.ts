import { chatDelete, chatGet, chatJson, chatPost } from "@/lib/chat-api";
import { getRoomByToken, resolveGuestAccess } from "@/lib/rooms";
import { getSettings } from "@/lib/settings";
import { ensurePoller } from "@/lib/telegram/poller";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

/** Guest chat API — access is re-validated on every call (password version, bans, rotation). */
async function resolve(ctx: Ctx) {
  const { token } = await ctx.params;
  const settings = await getSettings();
  if (settings.maintenanceMode) return { error: chatJson({ error: "maintenance" }, 503) };
  const room = await getRoomByToken(token);
  if (!room) return { error: chatJson({ error: "gone" }, 404) };
  if (room.isDisabled) return { error: chatJson({ error: "disabled" }, 403) };
  const access = await resolveGuestAccess(room);
  if (access.state !== "chat") return { error: chatJson({ error: access.state }, 403) };
  const nickname = access.member.nickname ?? "Guest";
  return {
    room,
    viewer: { memberId: access.member.id, nickname, role: "guest" as const, authorName: nickname },
  };
}

export async function GET(req: Request, ctx: Ctx) {
  ensurePoller();
  const r = await resolve(ctx);
  if ("error" in r) return r.error;
  return chatGet(req, r.room, r.viewer);
}

export async function POST(req: Request, ctx: Ctx) {
  const r = await resolve(ctx);
  if ("error" in r) return r.error;
  return chatPost(req, r.room, r.viewer);
}

export async function DELETE(req: Request, ctx: Ctx) {
  const r = await resolve(ctx);
  if ("error" in r) return r.error;
  return chatDelete(req, r.room, r.viewer);
}
