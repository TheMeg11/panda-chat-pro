import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { roomMembers, users } from "@/db/schema";
import { RoomWorkspace } from "@/components/dashboard/room-workspace";
import { DmWorkspace } from "@/components/dashboard/dm-workspace";
import { requireUser } from "@/lib/auth";
import { buildSnapshot } from "@/lib/chat";
import { getI18n } from "@/lib/i18n-server";
import { getBaseUrl } from "@/lib/request";
import { getAccessibleRoom, getOwnerMember, listMembers } from "@/lib/rooms";
import { getSettings } from "@/lib/settings";
import { linkForUser } from "@/lib/telegram/service";
import { BOT_COMMANDS } from "@/lib/telegram/service";
import { shortId } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.common.rooms, robots: { index: false } };
}

export default async function RoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const room = await getAccessibleRoom(user.id, id);
  if (!room) notFound();

  const member = await getOwnerMember(room, user);
  const viewer = { memberId: member.id, nickname: user.displayName, role: "owner" as const };

  /* ------------------------------ 1:1 private chat ------------------------------ */
  if (room.type === "dm") {
    const [settings] = await Promise.all([getSettings()]);
    const peerRows = await db
      .select({ username: users.username, displayName: users.displayName })
      .from(roomMembers)
      .innerJoin(users, eq(users.id, roomMembers.userId))
      .where(
        and(
          eq(roomMembers.roomId, room.id),
          eq(roomMembers.role, "owner"),
          ne(roomMembers.userId, user.id),
        ),
      )
      .limit(1);
    // Fallback when the peer account no longer exists: keep the stored name.
    const peerName = peerRows[0]?.displayName ?? room.name;
    const snapshot = await buildSnapshot(room, viewer, 0, null, {
      name: peerName,
      subtitle: peerRows[0] ? `@${peerRows[0].username}` : undefined,
      direct: true,
      description: "",
    });
    return (
      <DmWorkspace
        roomId={room.id}
        peer={{ displayName: peerName, username: peerRows[0]?.username ?? null }}
        snapshot={snapshot}
        maxLength={settings.maxMessageLength}
      />
    );
  }

  /* ------------------------------ classic invite room ------------------------------ */
  const [settings, baseUrl, members, link] = await Promise.all([
    getSettings(),
    getBaseUrl(),
    listMembers(room.id),
    linkForUser(user.id),
  ]);
  const snapshot = await buildSnapshot(room, viewer, 0, null);
  const premiumBlocked = settings.telegramPaid && !user.canUseTelegram;

  return (
    <RoomWorkspace
      room={{
        id: room.id,
        name: room.name,
        description: room.description,
        inviteUrl: `${baseUrl}/r/${room.inviteToken}`,
        hasPassword: Boolean(room.passwordHash),
        isLocked: room.isLocked,
        isDisabled: room.isDisabled,
      }}
      snapshot={snapshot}
      members={members
        .filter((m) => m.role === "guest")
        .map((m) => ({
          id: m.id,
          shortId: shortId(m.id),
          nickname: m.nickname ?? "",
          status: m.status,
          lastSeenAt: m.lastSeenAt.toISOString(),
        }))}
      telegram={{
        platformEnabled: settings.telegramEnabled,
        paid: settings.telegramPaid,
        allowed: !premiumBlocked,
        linked: Boolean(link),
        chatName: link?.chatName ?? null,
        muted: link ? link.mutedRooms.includes(room.id) : false,
      }}
      maxLength={settings.maxMessageLength}
      commands={BOT_COMMANDS}
    />
  );
}
