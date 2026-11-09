"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { getCurrentUser, SESSION_COOKIE } from "@/lib/auth";
import { hashPassword, verifyPassword } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import type { ActionState } from "@/lib/utils";

export async function updateProfileAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "unauthorized" };
  const displayName = String(formData.get("displayName") ?? "").replace(/\s+/g, " ").trim();
  if (displayName.length < 1 || displayName.length > 40) return { error: "displayNameInvalid" };
  await db.update(users).set({ displayName }).where(eq(users.id, user.id));
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "account.profileSaved" };
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

export async function deleteAccountAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "unauthorized" };
  if (!rateLimit(`del:${user.id}`, 5, 10 * 60_000).ok) return { error: "rateLimited" };
  if (!(await verifyPassword(String(formData.get("password") ?? ""), user.passwordHash))) {
    return { error: "currentPasswordWrong" };
  }
  // Rooms, members, sessions and the Telegram link all cascade with the user.
  await db.delete(users).where(eq(users.id, user.id));
  (await cookies()).delete(SESSION_COOKIE);
  redirect("/");
}
