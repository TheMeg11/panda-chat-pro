"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { telegramLinkCodes, telegramLinks } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { getSettings, updateSettings } from "@/lib/settings";
import {
  clearPlatformBotToken,
  getPlatformBot,
  isPlatformOwner,
  savePlatformBotToken,
  TelegramError,
  tg,
} from "@/lib/telegram/platform";
import { createLinkCode, linkForUser } from "@/lib/telegram/service";
import type { ActionState } from "@/lib/utils";

/** Generates a fresh /start code and returns the deep link to the official bot. */
export async function startTelegramLinkAction(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "unauthorized" };
  const settings = await getSettings();
  if (!settings.telegramEnabled) return { error: "telegramDisabled" };
  if (settings.telegramPaid && !user.canUseTelegram) return { error: "telegramNotAllowed" };
  if (!rateLimit(`tglink:${user.id}`, 6, 10 * 60_000).ok) return { error: "rateLimited" };

  const bot = await getPlatformBot();
  if (!bot.configured || !bot.botUsername) return { error: "telegramMissing" };
  if (await linkForUser(user.id)) return { error: "telegramAlreadyLinked" };

  const code = await createLinkCode(user.id);
  return { ok: true, data: { code, url: `https://t.me/${bot.botUsername}?start=${code}` } };
}

/** Disconnects the Telegram chat from the caller's account. */
export async function telegramUnlinkAction(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "unauthorized" };
  const link = await linkForUser(user.id);
  if (!link) return { error: "telegramNotLinked" };
  await db.delete(telegramLinks).where(eq(telegramLinks.userId, user.id));
  await db.delete(telegramLinkCodes).where(eq(telegramLinkCodes.userId, user.id));
  const bot = await getPlatformBot();
  if (bot.configured) {
    await tg(bot.token, "sendMessage", {
      chat_id: link.chatId,
      text: "👋 This chat was disconnected from Panda Chat (from the website).",
    }).catch(() => undefined);
  }
  revalidatePath("/dashboard/settings");
  return { ok: true, message: "account.tgUnlinked" };
}

/** Master switch for message forwarding to the caller's chat. */
export async function telegramForwardAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "unauthorized" };
  const enabled = formData.get("enabled") === "1";
  const updated = await db
    .update(telegramLinks)
    .set({ forwardEnabled: enabled, updatedAt: new Date() })
    .where(eq(telegramLinks.userId, user.id))
    .returning({ id: telegramLinks.id });
  if (updated.length === 0) return { error: "telegramNotLinked" };
  revalidatePath("/dashboard/settings");
  return { ok: true, message: enabled ? "account.tgForwardOn" : "account.tgForwardOff" };
}

/** §6.2 consent switch: can OTHER linked users reach me with /msg? */
export async function telegramBotDmAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "unauthorized" };
  const enabled = formData.get("enabled") === "1";
  const updated = await db
    .update(telegramLinks)
    .set({ allowBotDm: enabled, updatedAt: new Date() })
    .where(eq(telegramLinks.userId, user.id))
    .returning({ id: telegramLinks.id });
  if (updated.length === 0) return { error: "telegramNotLinked" };
  revalidatePath("/dashboard/settings");
  return { ok: true, message: enabled ? "account.tgBotDmOn" : "account.tgBotDmOff" };
}

/** Offline notify toggle: a digest ping after 15 minutes away (§5.5). */
export async function telegramOfflineNotifyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "unauthorized" };
  const enabled = formData.get("enabled") === "1";
  const updated = await db
    .update(telegramLinks)
    .set({ offlineNotify: enabled, updatedAt: new Date() })
    .where(eq(telegramLinks.userId, user.id))
    .returning({ id: telegramLinks.id });
  if (updated.length === 0) return { error: "telegramNotLinked" };
  revalidatePath("/dashboard/settings");
  return { ok: true, message: enabled ? "account.tgOfflineNotifyOn" : "account.tgOfflineNotifyOff" };
}

/** Per-user platform-announcements switch (independent of forwarding/notify). */
export async function telegramAnnounceAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "unauthorized" };
  const enabled = formData.get("enabled") === "1";
  const updated = await db
    .update(telegramLinks)
    .set({ announceEnabled: enabled, updatedAt: new Date() })
    .where(eq(telegramLinks.userId, user.id))
    .returning({ id: telegramLinks.id });
  if (updated.length === 0) return { error: "telegramNotLinked" };
  revalidatePath("/dashboard/settings");
  return { ok: true, message: enabled ? "account.tgAnnounceOn" : "account.tgAnnounceOff" };
}

/* ------------------------------------------------------------------ */
/* Official bot setup — v1.6.0, from the SITE (owner-only)              */
/*                                                                      */
/* The Super Admin console remains the full management surface; these   */
/* actions exist so the platform owner can never be locked out of bot   */
/* configuration (lost ADMIN_PATH, fresh deployment, phone-only).       */
/* ------------------------------------------------------------------ */

/** Saves + verifies the official platform bot token. Platform owner only. */
export async function savePlatformBotAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user || !(await isPlatformOwner(user))) return { error: "unauthorized" };
  if (!rateLimit(`botsetup:${user.id}`, 10, 10 * 60_000).ok) return { error: "rateLimited" };
  const token = String(formData.get("token") ?? "").trim();
  if (!token) return { error: "telegramTokenRequired" };
  try {
    const { botUsername } = await savePlatformBotToken(token);
    revalidatePath("/dashboard/settings");
    return { ok: true, message: "account.tgBotSaved", data: { botUsername } };
  } catch (error) {
    const text = error instanceof TelegramError ? error.message : "";
    return { error: "telegramTokenRejected", data: { detail: text.slice(0, 160) } };
  }
}

/** Removes the stored platform bot token (env fallback applies, if any). */
export async function clearPlatformBotAction(_prev: ActionState, _formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user || !(await isPlatformOwner(user))) return { error: "unauthorized" };
  await clearPlatformBotToken();
  revalidatePath("/dashboard/settings");
  return { ok: true, message: "account.tgBotCleared" };
}

/** Toggles paid mode (who may connect the bot) from the site. Owner only. */
export async function telegramPaidModeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user || !(await isPlatformOwner(user))) return { error: "unauthorized" };
  const enabled = formData.get("enabled") === "1";
  await updateSettings({ telegramPaid: enabled });
  revalidatePath("/dashboard/settings");
  return { ok: true, message: enabled ? "account.tgPaidOn" : "account.tgPaidOff" };
}
