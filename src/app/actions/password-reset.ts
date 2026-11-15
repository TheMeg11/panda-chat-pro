"use server";

import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { passwordResets, sessions, telegramLinks, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { hashPassword, randomToken, safeEqual, sha256 } from "@/lib/crypto";
import { rateLimitDistributed } from "@/lib/rate-limit";
import { requestMeta } from "@/lib/request";
import { getSettings } from "@/lib/settings";
import { getPlatformBot, tg } from "@/lib/telegram/platform";
import type { ActionState } from "@/lib/utils";

/**
 * Password reset via the official Telegram bot (§7).
 *
 * Anti-enumeration: the request step ALWAYS answers with the same generic
 * message, whether or not the account exists / has a linked Telegram chat. The
 * 6-digit code is random (crypto), stored only as sha256(salt + code), expires
 * after 15 minutes and survives at most 5 wrong attempts. Confirming revokes
 * EVERY session of the account.
 */

const USERNAME_RE = /^[a-z0-9_.]{3,32}$/;
const CODE_TTL_MS = 15 * 60_000;
const MAX_ATTEMPTS = 5;

/** sha256(salt + code), stored as `salt$hash` so verification can re-derive it. */
function hashResetCode(code: string): { codeHash: string; salt: string } {
  const salt = randomToken(8);
  return { codeHash: `${salt}$${sha256(salt + code)}`, salt };
}

/** 6 decimal digits with uniform-ish distribution from the crypto hash output. */
function generateCode(): string {
  return (parseInt(sha256(randomToken(16)).slice(0, 8), 16) % 1_000_000).toString().padStart(6, "0");
}

function verifyResetCode(codeHash: string, code: string): boolean {
  const [salt, digest] = codeHash.split("$");
  if (!salt || !digest) return false;
  return safeEqual(sha256(salt + code), digest);
}

export async function requestPasswordResetAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();

  // Rate limits first: 3/hour per username, 5/hour per IP (shared across instances).
  const meta = await requestMeta();
  if (!(await rateLimitDistributed(`pwreset:user:${username}`, 3, 60 * 60_000)).ok) return { error: "rateLimited" };
  if (!(await rateLimitDistributed(`pwreset:ip:${meta.ip}`, 5, 60 * 60_000)).ok) return { error: "rateLimited" };

  // Same generic answer no matter what happens below.
  const generic = (): ActionState => ({ ok: true, message: "auth.resetSent" });

  if (!USERNAME_RE.test(username)) return generic();

  const settings = await getSettings();
  if (!settings.telegramEnabled) return generic();

  let deliverable = false;
  let userId: string | null = null;
  try {
    const [row] = await db
      .select({ id: users.id, status: users.status, canUseTelegram: users.canUseTelegram })
      .from(users)
      .innerJoin(telegramLinks, eq(telegramLinks.userId, users.id))
      .where(eq(users.username, username))
      .limit(1);
    if (row && row.status === "active" && row.canUseTelegram) {
      deliverable = true;
      userId = row.id;
    }
  } catch (error) {
    console.error("[panda-chat] password reset lookup failed", error);
    return generic();
  }
  if (!deliverable || !userId) {
    // Unknown/unlinked accounts must not be distinguishable — also burn the
    // same time a real request would.
    hashResetCode(generateCode());
    return generic();
  }

  const code = generateCode();
  const { codeHash } = hashResetCode(code);

  try {
    // A fresh code invalidates every previous unused one for this account.
    await db.delete(passwordResets).where(and(eq(passwordResets.userId, userId), isNull(passwordResets.usedAt)));
    await db.insert(passwordResets).values({ userId, codeHash, expiresAt: new Date(Date.now() + CODE_TTL_MS) });
  } catch (error) {
    console.error("[panda-chat] password reset insert failed", error);
    return generic();
  }

  // Send through the official bot (best effort — never reveal the outcome).
  try {
    const [link] = await db.select({ chatId: telegramLinks.chatId }).from(telegramLinks).where(eq(telegramLinks.userId, userId)).limit(1);
    const bot = await getPlatformBot();
    if (link && bot.configured) {
      await tg(bot.token, "sendMessage", {
        chat_id: link.chatId,
        text:
          "🔐 <b>کد بازیابی رمز عبور پاندا چت</b>\n\n" +
          `کد شما: <code>${code}</code>\n\n` +
          "این کد ۱۵ دقیقه اعتبار دارد و فقط یک‌بار قابل استفاده است.\n" +
          "⚠️ این کد را با کسی به اشتراک نگذارید. اگر شما این درخواست را نداده‌اید، این پیام را نادیده بگیرید.",
        parse_mode: "HTML",
        link_preview_options: { is_disabled: true },
      }).catch(() => undefined);
    }
  } catch {
    /* best effort */
  }

  await audit("auth.password_reset_request", { actor: username, targetType: "user", targetId: userId, details: "code sent via telegram" });
  return generic();
}

export async function confirmPasswordResetAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const code = String(formData.get("code") ?? "").trim();
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const meta = await requestMeta();
  if (!(await rateLimitDistributed(`pwreset-confirm:${meta.ip}`, 20, 60 * 60_000)).ok) return { error: "rateLimited" };

  if (!USERNAME_RE.test(username)) return { error: "resetCodeInvalid" };
  if (!/^\d{6}$/.test(code)) return { error: "resetCodeInvalid" };
  if (newPassword.length < 8 || newPassword.length > 200) return { error: "passwordShort" };
  if (newPassword !== confirm) return { error: "passwordMismatch" };

  const invalid = (): ActionState => ({ error: "resetCodeInvalid" });

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
  if (!user) return invalid();

  const [reset] = await db
    .select()
    .from(passwordResets)
    .where(and(eq(passwordResets.userId, user.id), isNull(passwordResets.usedAt)))
    .orderBy(desc(passwordResets.createdAt))
    .limit(1);
  if (!reset) return invalid();

  // Expired codes are burned immediately.
  if (reset.expiresAt.getTime() < Date.now()) {
    await db.delete(passwordResets).where(eq(passwordResets.id, reset.id)).catch(() => undefined);
    return invalid();
  }

  if (!verifyResetCode(reset.codeHash, code)) {
    const attempts = reset.attempts + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await db.delete(passwordResets).where(eq(passwordResets.id, reset.id)).catch(() => undefined);
    } else {
      await db.update(passwordResets).set({ attempts }).where(eq(passwordResets.id, reset.id)).catch(() => undefined);
    }
    return invalid();
  }

  try {
    await db.update(passwordResets).set({ usedAt: new Date() }).where(eq(passwordResets.id, reset.id));
    await db.update(users).set({ passwordHash: await hashPassword(newPassword) }).where(eq(users.id, user.id));
    // Full revocation: a completed reset signs the account out everywhere.
    await db.delete(sessions).where(eq(sessions.userId, user.id));
  } catch (error) {
    console.error("[panda-chat] password reset confirm failed", error);
    return { error: "generic" };
  }

  await audit("auth.password_reset", { actor: username, targetType: "user", targetId: user.id, details: "password reset via telegram" });
  return { ok: true, message: "auth.resetDone" };
}
