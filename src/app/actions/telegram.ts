"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { telegramLinkCodes, telegramLinks } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { getSettings } from "@/lib/settings";
import { getPlatformBot, tg } from "@/lib/telegram/platform";
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
