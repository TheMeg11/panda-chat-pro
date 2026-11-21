"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { rooms, roomMembers, userBlocks } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { hashPassword } from "@/lib/crypto";
import {
  cleanText,
  clearRoom,
  getAccessibleRoom,
  getOwnedRoom,
  getOwnerMember,
  newInviteToken,
  renameRoom,
  rotateInvite,
  setMemberStatus,
  setRoomLocked,
  setRoomPassword,
} from "@/lib/rooms";
import { getSettings, roomLimitFor } from "@/lib/settings";
import type { ActionState } from "@/lib/utils";

export async function createRoomAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "unauthorized" };
  const settings = await getSettings();
  if (settings.maintenanceMode) return { error: "maintenance" };

  const name = cleanText(formData.get("name"), 60);
  const description = cleanText(formData.get("description"), 280);
  const password = String(formData.get("password") ?? "");
  if (!name) return { error: "roomNameInvalid" };
  if (password && (password.length < 4 || password.length > 128)) return { error: "roomPasswordShort" };

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(rooms)
    .where(and(eq(rooms.ownerId, user.id), ne(rooms.type, "dm")));
  if (n >= roomLimitFor(user, settings)) return { error: "roomLimit" };

  const [room] = await db
    .insert(rooms)
    .values({
      ownerId: user.id,
      name,
      description,
      inviteToken: newInviteToken(),
      passwordHash: password ? await hashPassword(password) : null,
      passwordVersion: password ? 1 : 0,
    })
    .returning();
  await getOwnerMember(room, user);
  revalidatePath("/dashboard");
  redirect(`/dashboard/rooms/${room.id}`);
}

/** All owner-side room management operations. Ownership is verified on every call. */
export async function roomAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "unauthorized" };
  const settings = await getSettings();
  if (settings.maintenanceMode) return { error: "maintenance" };

  const room = await getOwnedRoom(user.id, String(formData.get("roomId") ?? ""));
  if (!room) return { error: "notFound" };
  const op = String(formData.get("op") ?? "");
  if (room.isDisabled && op !== "delete") return { error: "roomDisabled" };
  // 1:1 chats only support clearing the history or deleting the whole conversation —
  // invites, passwords, locks, kicks and per-room bots make no sense there.
  if (room.type === "dm" && op !== "delete" && op !== "clear") return { error: "invalidInput" };

  const done = (message: string): ActionState => {
    revalidatePath(`/dashboard/rooms/${room.id}`);
    revalidatePath("/dashboard");
    return { ok: true, message };
  };

  switch (op) {
    case "update": {
      const name = cleanText(formData.get("name"), 60);
      if (!name) return { error: "roomNameInvalid" };
      await renameRoom(room.id, name, cleanText(formData.get("description"), 280));
      return done("room.saved");
    }
    case "rotate":
      await rotateInvite(room.id);
      return done("room.rotated");
    case "password": {
      const password = String(formData.get("password") ?? "");
      if (password.length < 4 || password.length > 128) return { error: "roomPasswordShort" };
      await setRoomPassword(room.id, password);
      return done("room.passwordSaved");
    }
    case "removePassword":
      await setRoomPassword(room.id, null);
      return done("room.passwordRemoved");
    case "lock":
      await setRoomLocked(room.id, true);
      return done("room.lockedNow");
    case "unlock":
      await setRoomLocked(room.id, false);
      return done("room.unlockedNow");
    case "clear":
      await clearRoom(room.id);
      return done("room.cleared");
    case "kick":
    case "unban": {
      const member = await setMemberStatus(room.id, String(formData.get("memberId") ?? ""), op === "kick" ? "banned" : "active");
      if (!member) return { error: "notFound" };
      return done(op === "kick" ? "room.memberRemoved" : "room.memberRestored");
    }
    case "delete":
      await db.delete(rooms).where(eq(rooms.id, room.id));
      revalidatePath("/dashboard");
      redirect("/dashboard");
    default:
      return { error: "invalidInput" };
  }
}

/** Delete a conversation the user participates in — rooms require ownership, DMs allow either side. */
export async function deleteChatAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "unauthorized" };
  const settings = await getSettings();
  if (settings.maintenanceMode) return { error: "maintenance" };

  const roomId = String(formData.get("roomId") ?? "");
  const room = await getAccessibleRoom(user.id, roomId);
  if (!room) return { error: "notFound" };
  await db.delete(rooms).where(eq(rooms.id, room.id));
  revalidatePath("/dashboard");
  redirect("/dashboard");
}

/**
 * v1.7.0 — block/unblock the other participant of a 1:1 chat (`op` = block |
 * unblock). Blocking is one-sided state stored as a blocker → blocked pair;
 * the send path freezes the conversation in BOTH directions while a row
 * exists, so either side alone can stop the exchange.
 */
export async function blockPeerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "unauthorized" };
  const settings = await getSettings();
  if (settings.maintenanceMode) return { error: "maintenance" };

  const op = String(formData.get("op") ?? "");
  if (op !== "block" && op !== "unblock") return { error: "invalidInput" };
  const room = await getAccessibleRoom(user.id, String(formData.get("roomId") ?? ""));
  if (!room || room.type !== "dm") return { error: "notFound" };

  const members = await db
    .select({ userId: roomMembers.userId })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, room.id), eq(roomMembers.role, "owner"), isNotNull(roomMembers.userId)));
  const peerId = members.map((m) => m.userId).find((id) => id && id !== user.id);
  if (!peerId) return { error: "notFound" };

  if (op === "block") {
    await db.insert(userBlocks).values({ blockerId: user.id, blockedId: peerId }).onConflictDoNothing();
  } else {
    await db
      .delete(userBlocks)
      .where(and(eq(userBlocks.blockerId, user.id), eq(userBlocks.blockedId, peerId)));
  }
  revalidatePath(`/dashboard/rooms/${room.id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

/** v1.7.0 — wipe every message of a conversation without deleting the chat itself. */
export async function clearChatAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "unauthorized" };
  const settings = await getSettings();
  if (settings.maintenanceMode) return { error: "maintenance" };

  const room = await getAccessibleRoom(user.id, String(formData.get("roomId") ?? ""));
  if (!room) return { error: "notFound" };
  await clearRoom(room.id);
  revalidatePath(`/dashboard/rooms/${room.id}`);
  revalidatePath("/dashboard");
  return { ok: true };
}
