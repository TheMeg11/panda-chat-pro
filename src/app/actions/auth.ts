"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createUserSession, destroyCurrentSession } from "@/lib/auth";
import { hashPassword, verifyDummyPassword, verifyPassword } from "@/lib/crypto";
import { clearRateLimit, rateLimit } from "@/lib/rate-limit";
import { requestMeta } from "@/lib/request";
import { getSettings } from "@/lib/settings";
import type { ActionState } from "@/lib/utils";

const USERNAME_RE = /^[a-z0-9_.]{3,24}$/;

export async function loginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const remember = formData.get("remember") === "on";
  if (!username || !password) return { error: "invalidCredentials" };

  const settings = await getSettings();
  if (settings.maintenanceMode) return { error: "maintenance" };

  const meta = await requestMeta();
  const key = `login:${meta.ip}:${username}`;
  if (!rateLimit(key, 8, 10 * 60_000).ok) return { error: "rateLimited" };

  const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  const valid = user ? await verifyPassword(password, user.passwordHash) : await verifyDummyPassword(password);
  if (!user || !valid) return { error: "invalidCredentials" };
  if (user.status !== "active") return { error: "accountSuspended" };

  clearRateLimit(key);
  await createUserSession(user.id, remember);
  await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
  redirect("/dashboard");
}

export async function registerAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const settings = await getSettings();
  if (!settings.registrationOpen) return { error: "registrationClosed" };
  if (settings.maintenanceMode) return { error: "maintenance" };

  const displayName = String(formData.get("displayName") ?? "").replace(/\s+/g, " ").trim();
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const remember = formData.get("remember") === "on";

  if (displayName.length < 1 || displayName.length > 40) return { error: "displayNameInvalid" };
  if (!USERNAME_RE.test(username)) return { error: "usernameInvalid" };
  if (password.length < 8 || password.length > 200) return { error: "passwordShort" };
  if (password !== confirm) return { error: "passwordMismatch" };

  const meta = await requestMeta();
  if (!rateLimit(`register:${meta.ip}`, 10, 60 * 60_000).ok) return { error: "rateLimited" };

  const [exists] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
  if (exists) return { error: "usernameTaken" };

  let userId: string;
  try {
    const [created] = await db
      .insert(users)
      .values({ username, displayName, passwordHash: await hashPassword(password), lastLoginAt: new Date() })
      .returning({ id: users.id });
    userId = created.id;
  } catch {
    return { error: "usernameTaken" };
  }
  await createUserSession(userId, remember);
  redirect("/dashboard");
}

export async function logoutAction(): Promise<void> {
  await destroyCurrentSession();
  redirect("/login");
}
