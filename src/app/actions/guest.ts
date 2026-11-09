"use server";

import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { roomMembers } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { verifyPassword } from "@/lib/crypto";
import { clearRateLimit, rateLimit } from "@/lib/rate-limit";
import { requestMeta } from "@/lib/request";
import { addSystemMessage, ensureDeviceHash, getRoomByToken, readDeviceHash, resolveGuestAccess } from "@/lib/rooms";
import { getSettings } from "@/lib/settings";
import { esc, notifyTelegram } from "@/lib/telegram/service";
import type { ActionState } from "@/lib/utils";

async function loadRoom(formData: FormData) {
  const settings = await getSettings();
  if (settings.maintenanceMode) return { error: "maintenance" as const };
  const token = String(formData.get("token") ?? "");
  const room = await getRoomByToken(token);
  if (!room) return { error: "notFound" as const };
  if (room.isDisabled) return { error: "roomDisabled" as const };
  return { room, token };
}

/** Step 1 for protected rooms: verify the password server-side before anything is revealed. */
export async function unlockRoomAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const loaded = await loadRoom(formData);
  if ("error" in loaded) return { error: loaded.error };
  const { room, token } = loaded;
  if (!room.passwordHash) {
    revalidatePath(`/r/${token}`);
    return { ok: true };
  }
  const meta = await requestMeta();
  const key = `unlock:${meta.ip}:${room.id}`;
  if (!rateLimit(key, 8, 10 * 60_000).ok) return { error: "rateLimited" };
  if (!(await verifyPassword(String(formData.get("password") ?? ""), room.passwordHash))) {
    return { error: "wrongPassword" };
  }
  clearRateLimit(key);
  const deviceHash = await ensureDeviceHash();
  const user = await getCurrentUser();
  await db
    .insert(roomMembers)
    .values({ roomId: room.id, deviceHash, userId: user?.id ?? null, role: "guest", passwordVersion: room.passwordVersion })
    .onConflictDoUpdate({
      target: [roomMembers.roomId, roomMembers.deviceHash],
      set: { passwordVersion: room.passwordVersion },
    });
  revalidatePath(`/r/${token}`);
  return { ok: true };
}

/** Step 2: choose a nickname and join. */
export async function joinRoomAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const nickname = String(formData.get("nickname") ?? "").replace(/\s+/g, " ").trim();
  if (nickname.length < 1 || nickname.length > 24) return { error: "nicknameInvalid" };
  const loaded = await loadRoom(formData);
  if ("error" in loaded) return { error: loaded.error };
  const { room, token } = loaded;

  // Joins are spam-sensitive: they create member rows and Telegram notifications.
  const meta = await requestMeta();
  if (!rateLimit(`join:${meta.ip}`, 10, 60 * 60_000).ok) return { error: "rateLimited" };

  const deviceHash = await ensureDeviceHash();
  if (!rateLimit(`join-dev:${deviceHash}`, 6, 10 * 60_000).ok) return { error: "rateLimited" };

  const access = await resolveGuestAccess(room, deviceHash);
  if (access.state === "banned") return { error: "unauthorized" };
  if (access.state === "password") return { error: "wrongPassword" };

  const user = await getCurrentUser();
  const wasMember = Boolean(access.member?.nickname);
  if (access.member) {
    await db
      .update(roomMembers)
      .set({ nickname, lastSeenAt: new Date(), passwordVersion: room.passwordVersion })
      .where(eq(roomMembers.id, access.member.id));
  } else {
    await db.insert(roomMembers).values({
      roomId: room.id,
      deviceHash,
      userId: user?.id ?? null,
      nickname,
      role: "guest",
      passwordVersion: room.passwordVersion,
    });
  }
  if (!wasMember) {
    await addSystemMessage(room.id, "joined", nickname);
    after(() => notifyTelegram(room.id, `👋 <b>${esc(nickname)}</b> joined <b>${esc(room.name)}</b>`));
  }
  revalidatePath(`/r/${token}`);
  return { ok: true };
}

export async function leaveRoomAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const loaded = await loadRoom(formData);
  if ("error" in loaded) return { error: loaded.error };
  const { room } = loaded;
  const deviceHash = await readDeviceHash();
  if (deviceHash) {
    const [member] = await db
      .select()
      .from(roomMembers)
      .where(and(eq(roomMembers.roomId, room.id), eq(roomMembers.deviceHash, deviceHash)))
      .limit(1);
    if (member && member.role === "guest" && member.status === "active" && member.nickname) {
      await db.update(roomMembers).set({ nickname: null, passwordVersion: -1 }).where(eq(roomMembers.id, member.id));
      await addSystemMessage(room.id, "left", member.nickname);
    }
  }
  redirect("/");
}
