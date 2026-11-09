"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { deletedAccounts, messages, roomMembers, rooms, sessions, userAvatars, users } from "@/db/schema";
import { getCurrentUser, SESSION_COOKIE } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { sniffMime } from "@/lib/file-mime";
import { rateLimit } from "@/lib/rate-limit";
import { beginEnrollment, confirmEnrollment, disable2fa, getTwoFactorState } from "@/lib/twofactor";
import { otpauthUrl } from "@/lib/totp";
import type { ActionState } from "@/lib/utils";

export async function updateProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "unauthorized" };
  const displayName = String(formData.get("displayName") ?? "").replace(/\s+/g, " ").trim();
  if (displayName.length < 1 || displayName.length > 40) return { error: "displayNameInvalid" };
  const bio = String(formData.get("bio") ?? "").trim();
  if (bio.length > 280) return { error: "bioTooLong" };
  await db.update(users).set({ displayName, bio: bio || null }).where(eq(users.id, user.id));
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "account.profileSaved" };
}

/* ------------------------------------------------------------------ */
/* Profile avatar (PNG / JPEG / WebP, magic-byte verified)            */
/* ------------------------------------------------------------------ */

const AVATAR_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);
const AVATAR_MIN_BYTES = 64 * 1024;
const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/** Replaces the caller's stored avatar (single row per account). */
export async function uploadAvatarAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "unauthorized" };
  if (!rateLimit(`avatar:${user.id}`, 10, 10 * 60_000).ok) return { error: "rateLimited" };

  const file = formData.get("avatar");
  if (!(file instanceof File) || file.size === 0) return { error: "avatarInvalid" };
  if (file.size < AVATAR_MIN_BYTES) return { error: "avatarTooSmall" };
  if (file.size > AVATAR_MAX_BYTES) return { error: "fileTooBig" };
  if (!AVATAR_MIMES.has(file.type)) return { error: "avatarInvalid" }; // SVG is rejected outright

  const buf = Buffer.from(await file.arrayBuffer());
  // Magic bytes are authoritative — the client-declared type is never trusted.
  const sniffed = sniffMime(buf);
  if (!sniffed || !AVATAR_MIMES.has(sniffed)) return { error: "avatarInvalid" };

  try {
    await db.delete(userAvatars).where(eq(userAvatars.userId, user.id));
    await db.insert(userAvatars).values({ userId: user.id, mime: sniffed, data: buf });
  } catch (error) {
    console.error("[panda-chat] avatar upload failed", error);
    return { error: "uploadFailed" };
  }
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "account.avatarSaved" };
}

/** Removes the caller's avatar. */
export async function removeAvatarAction(_prev: ActionState): Promise<ActionState> {
  void _prev;
  const user = await getCurrentUser();
  if (!user) return { error: "unauthorized" };
  // Same envelope as the upload action: rapid delete+revalidate spam is a
  // cheap DoS on the dashboard layout otherwise.
  if (!rateLimit(`avatar-del:${user.id}`, 10, 10 * 60_000).ok) return { error: "rateLimited" };
  await db.delete(userAvatars).where(eq(userAvatars.userId, user.id));
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "account.avatarRemoved" };
}

export async function changePasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "unauthorized" };
  if (!rateLimit(`pw:${user.id}`, 6, 10 * 60_000).ok) return { error: "rateLimited" };
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  if (!(await verifyPassword(current, user.passwordHash))) return { error: "currentPasswordWrong" };
  if (next.length < 8 || next.length > 200) return { error: "passwordShort" };
  if (next !== confirm) return { error: "passwordMismatch" };
  await db.update(users).set({ passwordHash: await hashPassword(next) }).where(eq(users.id, user.id));
  await db.delete(sessions).where(and(eq(sessions.userId, user.id), ne(sessions.id, user.sessionId)));
  revalidatePath("/dashboard/settings");
  return { ok: true, message: "account.passwordChanged" };
}

export async function signOutOthersAction(_prev: ActionState): Promise<ActionState> {
  void _prev;
  const user = await getCurrentUser();
  if (!user) return { error: "unauthorized" };
  await db.delete(sessions).where(and(eq(sessions.userId, user.id), ne(sessions.id, user.sessionId)));
  revalidatePath("/dashboard/settings");
  return { ok: true, message: "account.signedOutOthers" };
}

/** Revoke ONE specific session (device management from the sessions list). */
export async function revokeSessionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "unauthorized" };
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!/^[a-f0-9]{64}$/.test(sessionId)) return { error: "notFound" };
  const deleted = await db
    .delete(sessions)
    .where(and(eq(sessions.id, sessionId), eq(sessions.userId, user.id)))
    .returning({ id: sessions.id });
  revalidatePath("/dashboard/settings");
  return deleted.length ? { ok: true, message: "account.sessionRevoked" } : { error: "notFound" };
}

/* ------------------------------------------------------------------ */
/* Two-factor authentication management                                 */
/* ------------------------------------------------------------------ */

export async function twoFactorStartAction(_prev: ActionState): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "unauthorized" };
  if (!rateLimit(`2fa-start:${user.id}`, 5, 10 * 60_000).ok) return { error: "rateLimited" };
  const state = await getTwoFactorState(user.id);
  if (state.enabled) return { error: "alreadyEnabled" };
  const { secret } = await beginEnrollment(user.id);
  const { default: QRCode } = await import("qrcode");
  const qrDataUrl = await QRCode.toDataURL(otpauthUrl(secret, user.username), { margin: 1, width: 220 });
  return { ok: true, data: { secret, qrDataUrl } };
}

export async function twoFactorConfirmAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "unauthorized" };
  if (!rateLimit(`2fa-confirm:${user.id}`, 8, 10 * 60_000).ok) return { error: "rateLimited" };
  const code = String(formData.get("code") ?? "").trim();
  if (!/^\d{6}$/.test(code)) return { error: "invalid2faCode" };
  const result = await confirmEnrollment(user.id, code);
  if (!result.ok) return { error: "invalid2faCode" };
  revalidatePath("/dashboard/settings");
  return { ok: true, data: { recoveryCodes: result.recoveryCodes ?? [] }, message: "twofactor.enabled" };
}

export async function twoFactorDisableAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "unauthorized" };
  if (!rateLimit(`2fa-disable:${user.id}`, 5, 10 * 60_000).ok) return { error: "rateLimited" };
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { error: "invalid2faCode" };
  const ok = await disable2fa(user.id, code);
  if (!ok) return { error: "invalid2faCode" };
  revalidatePath("/dashboard/settings");
  return { ok: true, message: "twofactor.disabled" };
}

/* ------------------------------------------------------------------ */
/* Emergency account deletion                                           */
/* ------------------------------------------------------------------ */

export async function deleteAccountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "unauthorized" };
  if (!rateLimit(`del:${user.id}`, 5, 10 * 60_000).ok) return { error: "rateLimited" };
  if (!(await verifyPassword(String(formData.get("password") ?? ""), user.passwordHash))) {
    return { error: "currentPasswordWrong" };
  }

  // Tell a linked Telegram chat BEFORE the link row disappears with the cascade.
  try {
    const { notifyAccountDeletion } = await import("@/lib/account-deletion");
    await notifyAccountDeletion(user.id, user.username);
  } catch {
    /* best effort */
  }

  // Anonymize this user's guest messages in rooms they did NOT own, so the
  // conversation history of other people stops carrying their identity.
  const memberRooms = db
    .select({ id: roomMembers.id })
    .from(roomMembers)
    .innerJoin(rooms, eq(rooms.id, roomMembers.roomId))
    .where(and(eq(roomMembers.userId, user.id), ne(rooms.ownerId, user.id)));
  await db
    .update(messages)
    .set({ authorName: "Deleted user" })
    .where(eq(messages.memberId, memberRooms));

  // Tombstone: a later restore of an older backup must re-apply the deletion.
  await db
    .insert(deletedAccounts)
    .values({ userId: user.id, username: user.username })
    .onConflictDoNothing();

  // Rooms, members, files, sessions, 2FA and the Telegram link cascade with the user.
  await db.delete(users).where(eq(users.id, user.id));
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/");
}
