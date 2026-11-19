"use server";

/**
 * v2.2.0 — the hidden-chats vault, SERVER-side.
 *
 * The old device-local vault (localStorage `pc-vault`) kept "reverting" on
 * browsers that evict storage (in-app webviews, private modes, iOS) — the user
 * hid a chat, it came back on the next reload, and the vault read back empty.
 * Hiding is now an ordinary account setting:
 *
 *   - `hidden_rooms` table: one row per (user, room) — `listDashboardChats`
 *     excludes them, so a hidden chat stays hidden everywhere, instantly.
 *   - `users.hidden_pin_hash`: scrypt hash of the vault PIN. The PIN gates
 *     VIEWING the hidden list (5 taps on the version number → PIN → list).
 *     Hiding itself needs NO pin — one confirmation from the chat menu.
 *
 * Every action returns ActionState codes the dialog maps to i18n keys, and
 * revalidates the dashboard so the main list updates the moment an action
 * lands — same "instant" feel as sending a chat message.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { hiddenRooms, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { getAccessibleRoom, listDashboardChats, readDeviceHash } from "@/lib/rooms";
import { getSettings } from "@/lib/settings";
import type { ActionState } from "@/lib/utils";

/** A hidden chat, in the exact shape the main chat list renders. */
export type VaultChat = {
  id: string;
  name: string;
  type: "room" | "dm";
  lastMessage: { author: string; body: string; fileName: string | null } | null;
  lastActivityAt: string;
  hasUnread: boolean;
  hasPassword: boolean;
  isDisabled: boolean;
};

const MIN_PIN = 4;

function revalidateDashboards() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/about");
  revalidatePath("/dashboard/settings");
}

/** The viewer's hidden chats, in main-list shape (newest activity first). */
export async function listHiddenChats(): Promise<VaultChat[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const rows = await db
    .select({ roomId: hiddenRooms.roomId })
    .from(hiddenRooms)
    .where(eq(hiddenRooms.userId, user.id));
  if (rows.length === 0) return [];
  const ids = new Set(rows.map((r) => r.roomId));
  const chats = await listDashboardChats(user, await readDeviceHash(), { includeHidden: true });
  return chats
    .filter((c) => ids.has(c.id))
    .map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      lastMessage: c.lastMessage,
      lastActivityAt: c.lastActivityAt,
      hasUnread: c.hasUnread,
      hasPassword: c.hasPassword,
      isDisabled: c.isDisabled,
    }));
}

/** Does this account have a vault PIN yet? (drives setup vs unlock) */
export async function vaultStatusAction(): Promise<{ hasPin: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { hasPin: false };
  const rows = await db
    .select({ hiddenPinHash: users.hiddenPinHash })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  return { hasPin: Boolean(rows[0]?.hiddenPinHash) };
}

/**
 * Hide a chat — instant, no PIN required. One confirmation in the chat menu;
 * the row lands in `hidden_rooms` and the dashboard revalidates, so the chat
 * vanishes from every device the moment the action lands.
 */
export async function hideChatAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "unauthorized" };
  const settings = await getSettings();
  if (settings.maintenanceMode) return { error: "maintenance" };

  const roomId = String(formData.get("roomId") ?? "");
  const room = await getAccessibleRoom(user.id, roomId);
  if (!room) return { error: "notFound" };

  await db.insert(hiddenRooms).values({ userId: user.id, roomId: room.id }).onConflictDoNothing();
  revalidateDashboards();
  // Leaving the room page for the list — the chat is already gone there.
  redirect("/dashboard");
}

/** Unhide — the chat returns to the main list on every device, instantly. */
export async function unhideChatAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "unauthorized" };
  const roomId = String(formData.get("roomId") ?? "");
  if (!roomId) return { error: "notFound" };
  await db.delete(hiddenRooms).where(and(eq(hiddenRooms.userId, user.id), eq(hiddenRooms.roomId, roomId)));
  revalidateDashboards();
  return { ok: true };
}

/** First-time PIN setup (no old PIN required). */
export async function setVaultPinAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "unauthorized" };
  const rows = await db.select({ hiddenPinHash: users.hiddenPinHash }).from(users).where(eq(users.id, user.id)).limit(1);
  if (rows[0]?.hiddenPinHash) return { error: "pinExists" };

  const pin = String(formData.get("pin") ?? "");
  const pin2 = String(formData.get("pin2") ?? "");
  if (pin.length < MIN_PIN) return { error: "pinShort" };
  if (pin !== pin2) return { error: "pinMismatch" };

  await db.update(users).set({ hiddenPinHash: await hashPassword(pin) }).where(eq(users.id, user.id));
  revalidateDashboards();
  return { ok: true };
}

/** Change an existing PIN (requires the current one). */
export async function changeVaultPinAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "unauthorized" };
  const rows = await db.select({ hiddenPinHash: users.hiddenPinHash }).from(users).where(eq(users.id, user.id)).limit(1);
  const current = rows[0]?.hiddenPinHash;
  if (!current) return { error: "noPin" };

  const oldPin = String(formData.get("oldPin") ?? "");
  const pin = String(formData.get("pin") ?? "");
  const pin2 = String(formData.get("pin2") ?? "");
  if (!(await verifyPassword(oldPin, current))) return { error: "wrongPin" };
  if (pin.length < MIN_PIN) return { error: "pinShort" };
  if (pin !== pin2) return { error: "pinMismatch" };

  await db.update(users).set({ hiddenPinHash: await hashPassword(pin) }).where(eq(users.id, user.id));
  revalidateDashboards();
  return { ok: true };
}

/** Verify the PIN and (on success) return the hidden list — 5-tap entry. */
export async function verifyVaultAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "unauthorized" };
  const rows = await db.select({ hiddenPinHash: users.hiddenPinHash }).from(users).where(eq(users.id, user.id)).limit(1);
  const stored = rows[0]?.hiddenPinHash;
  if (!stored) return { error: "noPin" };
  const pin = String(formData.get("pin") ?? "");
  if (!(await verifyPassword(pin, stored))) return { error: "wrongPin" };
  const chats = await listHiddenChats();
  return { ok: true, data: { chats } };
}
