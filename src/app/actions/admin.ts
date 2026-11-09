"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { and, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { adminSessions, rooms, sessions, telegramLinks, users } from "@/db/schema";
import {
  createAdminSession,
  destroyAdminSession,
  getAdminBase,
  getAdminConfig,
  getAdminSession,
  verifyAdminCredentials,
} from "@/lib/admin-auth";
import { audit } from "@/lib/audit";
import { softDeleteMessage } from "@/lib/chat";
import { hashPassword } from "@/lib/crypto";
import { clearRateLimit, rateLimit } from "@/lib/rate-limit";
import { requestMeta } from "@/lib/request";
import { cleanText, clearRoom, getRoomById, rotateInvite, setMemberStatus, setRoomLocked, setRoomPassword } from "@/lib/rooms";
import { DEFAULT_SETTINGS, updateSettings } from "@/lib/settings";
import { clearPlatformBotToken, getPlatformBot, savePlatformBotToken, tg } from "@/lib/telegram/platform";
import { isUuid, type ActionState } from "@/lib/utils";

export async function adminLoginAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const config = getAdminConfig();
  if (!config.enabled) return { error: "notFound" };
  const meta = await requestMeta();
  const key = `admin-login:${meta.ip}`;
  if (!rateLimit(key, 5, 15 * 60_000).ok) return { error: "rateLimited" };
  const ok = await verifyAdminCredentials(String(formData.get("username") ?? ""), String(formData.get("password") ?? ""));
  if (!ok) {
    await audit("admin.login_failed", { actor: "anonymous", details: `ip=${meta.ip}` });
    return { error: "invalidCredentials" };
  }
  clearRateLimit(key);
  await createAdminSession();
  await audit("admin.login", { details: `ip=${meta.ip}` });
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function adminLogoutAction(): Promise<void> {
  await destroyAdminSession();
  revalidatePath("/", "layout");
}

const intOrNull = (value: FormDataEntryValue | null, min: number, max: number) => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : null;
};

/** Super Admin operations. The admin session is verified server-side for every call. */
export async function adminAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await getAdminSession())) return { error: "unauthorized" };
  const base = await getAdminBase();
  const op = String(formData.get("op") ?? "");
  const id = String(formData.get("id") ?? "");
  const roomId = String(formData.get("roomId") ?? "");

  switch (op) {
    /* ---------------- users ---------------- */
    case "user.update": {
      if (!isUuid(id)) return { error: "notFound" };
      const status = formData.get("status") === "suspended" ? "suspended" : "active";
      const canUseTelegram = formData.get("canUseTelegram") === "on";
      const maxRooms = intOrNull(formData.get("maxRooms"), 0, 10_000);
      const [user] = await db.update(users).set({ status, canUseTelegram, maxRooms }).where(eq(users.id, id)).returning();
      if (!user) return { error: "notFound" };
      if (status === "suspended") await db.delete(sessions).where(eq(sessions.userId, id));
      await audit("user.update", { targetType: "user", targetId: id, details: `status=${status} telegram=${canUseTelegram} maxRooms=${maxRooms ?? "default"}` });
      break;
    }
    case "user.password": {
      if (!isUuid(id)) return { error: "notFound" };
      const password = String(formData.get("password") ?? "");
      if (password.length < 8) return { error: "passwordShort" };
      await db.update(users).set({ passwordHash: await hashPassword(password) }).where(eq(users.id, id));
      await db.delete(sessions).where(eq(sessions.userId, id));
      await audit("user.reset_password", { targetType: "user", targetId: id });
      break;
    }
    case "user.revoke": {
      if (!isUuid(id)) return { error: "notFound" };
      await db.delete(sessions).where(eq(sessions.userId, id));
      await audit("user.revoke_sessions", { targetType: "user", targetId: id });
      break;
    }
    case "user.delete": {
      if (!isUuid(id)) return { error: "notFound" };
      const [deleted] = await db.delete(users).where(eq(users.id, id)).returning({ username: users.username });
      await audit("user.delete", { targetType: "user", targetId: id, details: deleted?.username });
      revalidatePath("/", "layout");
      redirect(`${base}/users`);
    }

    /* ---------------- rooms ---------------- */
    case "room.update": {
      const room = await getRoomById(id);
      if (!room) return { error: "notFound" };
      const name = cleanText(formData.get("name"), 60);
      if (!name) return { error: "roomNameInvalid" };
      const isLocked = formData.get("isLocked") === "on";
      const isDisabled = formData.get("isDisabled") === "on";
      await db
        .update(rooms)
        .set({ name, description: cleanText(formData.get("description"), 280), isDisabled, updatedAt: new Date() })
        .where(eq(rooms.id, room.id));
      if (isLocked !== room.isLocked) await setRoomLocked(room.id, isLocked);
      await audit("room.update", { targetType: "room", targetId: room.id, details: `locked=${isLocked} disabled=${isDisabled}` });
      break;
    }
    case "room.password": {
      if (!(await getRoomById(id))) return { error: "notFound" };
      const password = String(formData.get("password") ?? "");
      if (password.length < 4) return { error: "roomPasswordShort" };
      await setRoomPassword(id, password);
      await audit("room.set_password", { targetType: "room", targetId: id });
      break;
    }
    case "room.removePassword":
      if (!(await getRoomById(id))) return { error: "notFound" };
      await setRoomPassword(id, null);
      await audit("room.remove_password", { targetType: "room", targetId: id });
      break;
    case "room.rotate":
      if (!(await getRoomById(id))) return { error: "notFound" };
      await rotateInvite(id);
      await audit("room.rotate_link", { targetType: "room", targetId: id });
      break;
    case "room.clear":
      if (!(await getRoomById(id))) return { error: "notFound" };
      await clearRoom(id);
      await audit("room.clear", { targetType: "room", targetId: id });
      break;
    case "room.delete": {
      const room = await getRoomById(id);
      if (!room) return { error: "notFound" };
      await db.delete(rooms).where(eq(rooms.id, room.id));
      await audit("room.delete", { targetType: "room", targetId: room.id, details: room.name });
      revalidatePath("/", "layout");
      redirect(`${base}/rooms`);
    }
    case "member.ban":
    case "member.unban": {
      if (!isUuid(roomId)) return { error: "notFound" };
      const member = await setMemberStatus(roomId, id, op === "member.ban" ? "banned" : "active");
      if (!member) return { error: "notFound" };
      await audit(op, { targetType: "member", targetId: id, details: `room=${roomId} nickname=${member.nickname ?? ""}` });
      break;
    }
    case "message.delete": {
      const messageId = Number(id);
      if (!isUuid(roomId) || !Number.isSafeInteger(messageId)) return { error: "notFound" };
      await softDeleteMessage(roomId, messageId);
      await audit("message.delete", { targetType: "message", targetId: id, details: `room=${roomId}` });
      break;
    }

    /* ---------------- telegram ---------------- */
    case "bot.token": {
      const token = String(formData.get("token") ?? "").trim();
      try {
        if (!token) {
          await clearPlatformBotToken();
          const env = (process.env.TELEGRAM_BOT_TOKEN || process.env.SUPERADMIN_BOT_TOKEN || "").trim();
          await audit("bot.token_cleared", { details: env ? "fallback to env token" : "no env fallback" });
        } else {
          const { botUsername } = await savePlatformBotToken(token);
          await audit("bot.token_saved", { details: `@${botUsername}` });
        }
      } catch (error) {
        const code = (error as { code?: number }).code;
        return { error: code === 401 || code === 404 ? "tokenRejected" : code === 0 ? "tokenInvalid" : "telegramUnreachable" };
      }
      break;
    }
    case "bot.config": {
      const telegramEnabled = formData.get("telegramEnabled") === "on";
      const telegramPaid = formData.get("telegramPaid") === "on";
      await updateSettings({ telegramEnabled, telegramPaid });
      (globalThis as typeof globalThis & { __pcPollerSync?: () => void }).__pcPollerSync?.();
      await audit("bot.config", { details: `enabled=${telegramEnabled} paid=${telegramPaid}` });
      break;
    }
    case "link.unlink": {
      const [link] = await db.delete(telegramLinks).where(eq(telegramLinks.id, id)).returning();
      if (!link) return { error: "notFound" };
      const bot = await getPlatformBot();
      if (bot.configured) {
        await tg(bot.token, "sendMessage", {
          chat_id: link.chatId,
          text: "👋 This chat was disconnected from Panda Chat by the administrator.",
        }).catch(() => undefined);
      }
      await audit("bot.unlink", { targetType: "telegram_link", targetId: id });
      break;
    }
    case "bot.disconnect": {
      // Legacy per-room bots (kept so old rows can still be removed).
      if (!isUuid(id)) return { error: "notFound" };
      const legacy = await import("@/lib/telegram/legacy");
      await legacy.teardownBot(id);
      await audit("bot.disconnect", { targetType: "room", targetId: id });
      break;
    }

    /* ---------------- platform & system ---------------- */
    case "settings.update": {
      const publicUrl = String(formData.get("publicUrl") ?? "").trim().replace(/\/+$/, "");
      if (publicUrl && !/^https?:\/\/[^\s/]+/i.test(publicUrl)) return { error: "invalidInput" };
      await updateSettings({
        registrationOpen: formData.get("registrationOpen") === "on",
        maintenanceMode: formData.get("maintenanceMode") === "on",
        announcement: String(formData.get("announcement") ?? "").trim().slice(0, 280),
        defaultMaxRooms: intOrNull(formData.get("defaultMaxRooms"), 0, 10_000) ?? DEFAULT_SETTINGS.defaultMaxRooms,
        maxMessageLength: intOrNull(formData.get("maxMessageLength"), 50, 10_000) ?? DEFAULT_SETTINGS.maxMessageLength,
        publicUrl: publicUrl.slice(0, 200),
      });
      await audit("settings.update");
      break;
    }
    case "system.revokeAll":
      await db.delete(sessions);
      await audit("system.revoke_all_sessions");
      break;
    case "system.purge": {
      const now = new Date();
      await db.delete(sessions).where(lt(sessions.expiresAt, now));
      await db.delete(adminSessions).where(and(lt(adminSessions.expiresAt, now)));
      await audit("system.purge_sessions");
      break;
    }

    /* ---------------- backups ---------------- */
    case "backup.config": {
      const { saveBackupConfig } = await import("@/lib/backup");
      const hour = intOrNull(formData.get("hour"), 0, 23);
      const chatId = String(formData.get("chatId") ?? "").trim();
      if (chatId && !/^-?\d{3,}$/.test(chatId)) return { error: "invalidInput" };
      await saveBackupConfig({
        enabled: formData.get("enabled") === "on",
        ...(hour !== null ? { hour } : {}),
        ...(chatId ? { chatId } : {}),
      });
      await audit("backup.config", { details: `enabled=${formData.get("enabled") === "on"} hour=${hour ?? "-"} chat=${chatId || "-"}` });
      break;
    }
    case "backup.run": {
      const { runBackup } = await import("@/lib/backup");
      after(async () => {
        const result = await runBackup("manual");
        await audit(result.ok ? "backup.manual" : "backup.manual_failed", {
          details: result.ok ? `parts=${result.parts} bytes=${result.bytes}` : result.error ?? "",
        }).catch(() => undefined);
      });
      break;
    }
    default:
      return { error: "invalidInput" };
  }

  revalidatePath("/", "layout");
  return { ok: true, message: "admin.done" };
}
