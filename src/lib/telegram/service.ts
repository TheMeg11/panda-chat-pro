import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  messages,
  roomMembers,
  rooms,
  telegramLinkCodes,
  telegramLinks,
  users,
  type Room,
  type TelegramLink,
  type User,
} from "@/db/schema";
import { randomToken } from "../crypto";
import { postMessage, softDeleteMessage } from "../chat";
import {
  clearRoom,
  findOrCreateDm,
  findMemberByShortId,
  getAccessibleRoom,
  getOwnerMember,
  getRoomById,
  renameRoom,
  rotateInvite,
  setMemberStatus,
  setRoomLocked,
  setRoomPassword,
} from "../rooms";
import { getSettings } from "../settings";
import { audit } from "../audit";
import { rateLimit } from "../rate-limit";
import { shortId } from "../utils";
import { tg } from "./platform";
import { getBotSettings, isBotAdmin, updateBotSettings } from "./bot-settings";
import { storeFile } from "../files";

/* ------------------------------------------------------------------ */
/* Slash commands exposed in the Telegram UI                            */
/* ------------------------------------------------------------------ */

export const BOT_COMMANDS = [
  { command: "help", description: "Show all commands" },
  { command: "me", description: "Your account & connection" },
  { command: "rooms", description: "Pick the room to manage" },
  { command: "status", description: "Active room overview" },
  { command: "online", description: "Who is online right now" },
  { command: "link", description: "Get the invite link" },
  { command: "newlink", description: "Generate a new invite link" },
  { command: "recent", description: "Show recent messages" },
  { command: "members", description: "List members and their IDs" },
  { command: "kick", description: "Remove a member: /kick <id>" },
  { command: "unban", description: "Allow a member back: /unban <id>" },
  { command: "lock", description: "Only you can send messages" },
  { command: "unlock", description: "Everyone can send messages" },
  { command: "password", description: "Set the room password: /password <new>" },
  { command: "nopassword", description: "Remove the room password" },
  { command: "rename", description: "Rename the room: /rename <name>" },
  { command: "mute", description: "Stop notifications for this room" },
  { command: "unmute", description: "Resume notifications for this room" },
  { command: "muteall", description: "Pause ALL message forwarding" },
  { command: "unmuteall", description: "Resume message forwarding" },
  { command: "send", description: "Post a message (or media) to the active room" },
  { command: "msg", description: "Private message a linked user: /msg <username> <text>" },
  { command: "setdefault", description: "Fallback room: /setdefault <id|off> (admins: platform-wide)" },
  { command: "settings", description: "Your bot settings & privacy switches" },
  { command: "clear", description: "Delete all messages: /clear confirm" },
  { command: "unlink", description: "Disconnect this Telegram chat" },
];

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const snippet = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const PUBLIC_NOTICE =
  "🐼 <b>Welcome to the official Panda Chat bot!</b>\n\n" +
  "This bot is the private control center for your Panda Chat account:\n" +
  "• every new room message is forwarded here\n" +
  "• reply to any forwarded message to answer instantly\n" +
  "• manage rooms with slash commands.\n\n" +
  "To connect, open <b>Panda Chat → Account → Telegram</b>, press <i>Connect</i> and send me the /start code it shows.";

/** Custom admin-authored /start text, or the default notice. */
async function welcomeText(): Promise<string> {
  const botSettings = await getBotSettings();
  return botSettings.startText.trim() ? botSettings.startText.trim().slice(0, 1500) : PUBLIC_NOTICE;
}

async function helpText(admin = false) {
  const botSettings = await getBotSettings();
  if (botSettings.helpText.trim()) return botSettings.helpText.trim().slice(0, 3000);
  return [
    "<b>🐼 Panda Chat bot</b>",
    "",
    "Messages from your rooms arrive here. <b>Reply</b> to any of them to answer in the room, or send a message to post it to your active room.",
    "",
    ...BOT_COMMANDS.map((c) => `/${c.command} — ${esc(c.description)}`),
    "/del — reply to a message with /del to delete it from the room",
    ...(admin ? ["", "<b>🛡 Super Admin</b>", "/backup /restore /platform — server management", "/setdefault &lt;roomId&gt; — set the platform fallback room"] : []),
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* Link helpers                                                         */
/* ------------------------------------------------------------------ */

export async function linkForUser(userId: string): Promise<TelegramLink | null> {
  const [row] = await db.select().from(telegramLinks).where(eq(telegramLinks.userId, userId)).limit(1);
  return row ?? null;
}

export async function linkForChat(chatId: string): Promise<{ link: TelegramLink; user: User } | null> {
  const [row] = await db
    .select({ link: telegramLinks, user: users })
    .from(telegramLinks)
    .innerJoin(users, eq(users.id, telegramLinks.userId))
    .where(eq(telegramLinks.chatId, chatId))
    .limit(1);
  return row ?? null;
}

export async function createLinkCode(userId: string): Promise<string> {
  const code = randomToken(9);
  await db.insert(telegramLinkCodes).values({ code, userId, expiresAt: new Date(Date.now() + 15 * 60_000) });
  return code;
}

async function loadOwnerContext(roomId: string) {
  const [row] = await db
    .select({ room: rooms, owner: users, link: telegramLinks })
    .from(rooms)
    .innerJoin(users, eq(users.id, rooms.ownerId))
    .leftJoin(telegramLinks, eq(telegramLinks.userId, users.id))
    .where(eq(rooms.id, roomId))
    .limit(1);
  return row ?? null;
}

function deliverable(owner: User, link: TelegramLink | null, settings: { telegramEnabled: boolean }) {
  return Boolean(settings.telegramEnabled && link && owner.status === "active" && owner.canUseTelegram);
}

/* ------------------------------------------------------------------ */
/* Forwarding & notifications                                           */
/* ------------------------------------------------------------------ */

/** Forwards a room message to the owner's Telegram chat (with management buttons). */
export async function forwardMessageToTelegram(roomId: string, messageId: number) {
  const settings = await getSettings();
  if (!settings.telegramEnabled) return;
  const ctx = await loadOwnerContext(roomId);
  if (!ctx || !ctx.link || !deliverable(ctx.owner, ctx.link, settings) || ctx.room.isDisabled) return;
  const { room, owner, link } = ctx;
  // E2EE rooms are never forwarded: the bot would only receive ciphertext it
  // cannot decrypt, and the server must not become a decryption oracle (§6.8).
  if (room.e2eeEnabled) return;
  if (!link.forwardEnabled || link.mutedRooms.includes(roomId)) return;

  const [msg] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
  if (!msg || msg.deletedAt) return;

  let replyLine = "";
  let replyToTg: number | null = null;
  if (msg.replyToId) {
    const [target] = await db.select().from(messages).where(eq(messages.id, msg.replyToId)).limit(1);
    if (target && !target.deletedAt) {
      replyLine = `\n<i>↪ ${esc(target.authorName)}: ${esc(snippet(target.body || (target.fileName ? `📎 ${target.fileName}` : ""), 70))}</i>`;
      replyToTg = target.tgMessageId;
    }
  }
  const fileLine = msg.fileName
    ? `📎 <b>${esc(msg.fileName)}</b> (${Math.max(1, Math.round((msg.fileSize ?? 0) / 1024))} KB)\n`
    : "";
  const muted = link.mutedRooms.includes(roomId);
  const text = `💬 <b>${esc(msg.authorName)}</b> · ${esc(room.name)}${replyLine}\n\n${fileLine}${esc(msg.body)}`.trimEnd();
  const buttons: Array<{ text: string; callback_data: string }> = [{ text: "🗑 Delete", callback_data: `del:${msg.id}` }];
  if (msg.memberId && msg.authorRole === "guest") buttons.push({ text: "🚫 Remove sender", callback_data: `ban:${msg.memberId}` });
  buttons.push({ text: muted ? "🔔 Unmute room" : "🔕 Mute room", callback_data: `mute:${roomId}` });

  const bot = await import("./platform").then((m) => m.getPlatformBot());
  if (!bot.configured) return;
  try {
    const sent = await tg<{ message_id: number }>(bot.token, "sendMessage", {
      chat_id: link.chatId,
      text: text.slice(0, 4000),
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      reply_markup: { inline_keyboard: [buttons] },
      ...(replyToTg ? { reply_parameters: { message_id: replyToTg, allow_sending_without_reply: true } } : {}),
    });
    await db.update(messages).set({ tgMessageId: sent.message_id }).where(eq(messages.id, msg.id));
  } catch (error) {
    console.error("[panda-chat] telegram forward failed", error);
  }
}

/** System notices (joins, leaves…) to the room owner. */
export async function notifyTelegram(roomId: string, html: string) {
  const settings = await getSettings();
  if (!settings.telegramEnabled) return;
  const ctx = await loadOwnerContext(roomId);
  if (!ctx || !ctx.link || !deliverable(ctx.owner, ctx.link, settings) || ctx.room.isDisabled) return;
  if (!ctx.link.forwardEnabled || ctx.link.mutedRooms.includes(roomId)) return;
  const bot = await import("./platform").then((m) => m.getPlatformBot());
  if (!bot.configured) return;
  await tg(bot.token, "sendMessage", {
    chat_id: ctx.link.chatId,
    text: html,
    parse_mode: "HTML",
    disable_notification: true,
  }).catch((error) => console.error("[panda-chat] telegram notify failed", error));
}

export async function sendTestToOwner(roomId: string): Promise<"ok" | "nolink" | "error"> {
  const settings = await getSettings();
  const ctx = await loadOwnerContext(roomId);
  if (!ctx || !ctx.link) return "nolink";
  if (!deliverable(ctx.owner, ctx.link, settings)) return "nolink";
  const bot = await import("./platform").then((m) => m.getPlatformBot());
  if (!bot.configured) return "error";
  try {
    await tg(bot.token, "sendMessage", {
      chat_id: ctx.link.chatId,
      text: `🐼 Test from Panda Chat — <b>${esc(ctx.room.name)}</b> is connected and forwarding works.`,
      parse_mode: "HTML",
    });
    return "ok";
  } catch (error) {
    console.error("[panda-chat] telegram test failed", error);
    return "error";
  }
}

/* ------------------------------------------------------------------ */
/* Update handling: one bot for every linked account                    */
/* ------------------------------------------------------------------ */

type TgUser = { id: number; first_name?: string; last_name?: string; username?: string };
type TgFileLike = { file_id: string; file_name?: string; file_size?: number; mime_type?: string };
type TgMessage = {
  message_id: number;
  chat: { id: number; type: string; first_name?: string };
  from?: TgUser;
  text?: string;
  caption?: string;
  document?: TgFileLike;
  photo?: Array<{ file_id: string; file_size?: number }>;
  video?: TgFileLike;
  animation?: TgFileLike;
  voice?: { file_id: string; duration?: number; mime_type?: string };
  audio?: TgFileLike;
  video_note?: { file_id: string };
  sticker?: { file_id: string; emoji?: string };
  reply_to_message?: { message_id: number };
};
export type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  callback_query?: { id: string; from: TgUser; data?: string; message?: TgMessage };
};

/** Picks the largest attachable media payload off a Telegram message. */
function extractMedia(msg: TgMessage): { file_id: string; name: string; mime: string } | null {
  if (msg.document?.file_id) return { file_id: msg.document.file_id, name: msg.document.file_name ?? "file", mime: msg.document.mime_type ?? "application/octet-stream" };
  if (msg.photo?.length) { const p = msg.photo[msg.photo.length - 1]; return { file_id: p.file_id, name: "photo.jpg", mime: "image/jpeg" }; }
  if (msg.video?.file_id) return { file_id: msg.video.file_id, name: msg.video.file_name ?? "video.mp4", mime: "video/mp4" };
  if (msg.animation?.file_id) return { file_id: msg.animation.file_id, name: msg.animation.file_name ?? "animation.mp4", mime: "video/mp4" };
  if (msg.voice?.file_id) return { file_id: msg.voice.file_id, name: "voice.ogg", mime: "audio/ogg" };
  if (msg.audio?.file_id) return { file_id: msg.audio.file_id, name: msg.audio.file_name ?? "audio.mp3", mime: "audio/mpeg" };
  if (msg.video_note?.file_id) return { file_id: msg.video_note.file_id, name: "video-note.mp4", mime: "video/mp4" };
  return null;
}

/** Downloads a Telegram file (≤20MB by API contract) into a Blob. */
async function downloadTgFile(token: string, fileId: string): Promise<Blob | null> {
  try {
    const info = await tg<{ file_path?: string }>(token, "getFile", { file_id: fileId });
    if (!info.file_path) return null;
    const res = await fetch(`https://api.telegram.org/file/bot${token}/${info.file_path}`, {
      signal: AbortSignal.timeout(60_000),
      cache: "no-store",
    });
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

/** Stores a Telegram media payload as a room file and returns its id. */
async function storeTgMedia(token: string, roomId: string, memberId: string, media: { file_id: string; name: string; mime: string }): Promise<string | null> {
  const blob = await downloadTgFile(token, media.file_id);
  if (!blob) return null;
  const file = new File([blob], media.name, { type: media.mime });
  const stored = await storeFile(roomId, memberId, file);
  return stored.ok ? stored.file.id : null;
}

export async function handleUpdate(update: TgUpdate) {
  const bot = await import("./platform").then((m) => m.getPlatformBot());
  if (!bot.configured) return;
  const send = (chatId: string | number, text: string, extra: Record<string, unknown> = {}) =>
    tg(bot.token, "sendMessage", {
      chat_id: chatId,
      text: text.slice(0, 4000),
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      ...extra,
    }).catch((error) => console.error("[panda-chat] bot send failed", error));

  /* Inline buttons under forwarded messages */
  if (update.callback_query) {
    const cq = update.callback_query;
    const chatId = String(cq.message?.chat.id ?? cq.from.id);
    const answer = (text: string) =>
      tg(bot.token, "answerCallbackQuery", { callback_query_id: cq.id, text }).catch(() => undefined);
    const ctx = await linkForChat(chatId);
    if (!ctx) return void (await answer("This chat is not linked"));
    const { link, user } = ctx;
    const [kind, value = ""] = (cq.data ?? "").split(":");
    try {
      if (kind === "del") {
        const id = Number(value);
        const [msg] = await db.select({ roomId: messages.roomId }).from(messages).where(eq(messages.id, id)).limit(1);
        const [room] = msg ? await db.select({ ownerId: rooms.ownerId }).from(rooms).where(eq(rooms.id, msg.roomId)).limit(1) : [];
        if (!room || room.ownerId !== link.userId) return void (await answer("Not your room"));
        const ok = Number.isSafeInteger(id) && (await softDeleteMessage(msg.roomId, id));
        await answer(ok ? "🗑 Deleted from the room" : "Already deleted");
        if (cq.message)
          await tg(bot.token, "editMessageReplyMarkup", {
            chat_id: cq.message.chat.id,
            message_id: cq.message.message_id,
            reply_markup: { inline_keyboard: [[{ text: "🗑 Deleted", callback_data: "noop" }]] },
          }).catch(() => undefined);
      } else if (kind === "ban") {
        const [member] = await db
          .select({ roomId: roomMembers.roomId })
          .from(roomMembers)
          .where(eq(roomMembers.id, value))
          .limit(1);
        const [room] = member ? await db.select({ ownerId: rooms.ownerId }).from(rooms).where(eq(rooms.id, member.roomId)).limit(1) : [];
        if (!room || room.ownerId !== link.userId) return void (await answer("Not your room"));
        const m = await setMemberStatus(member.roomId, value, "banned");
        await answer(m ? `🚫 ${m.nickname ?? "Member"} was removed` : "Member not found");
      } else if (kind === "mute") {
        const room = await getRoomById(value);
        if (!room || room.ownerId !== link.userId) return void (await answer("Not your room"));
        const muted = link.mutedRooms.includes(room.id);
        await db
          .update(telegramLinks)
          .set({ mutedRooms: muted ? link.mutedRooms.filter((r) => r !== room.id) : [...link.mutedRooms, room.id], updatedAt: new Date() })
          .where(eq(telegramLinks.userId, link.userId));
        await answer(muted ? `🔔 ${room.name} unmuted` : `🔕 ${room.name} muted`);
      } else if (kind === "room") {
        const room = await getRoomById(value);
        if (!room || room.ownerId !== link.userId) return void (await answer("Not your room"));
        await db
          .update(telegramLinks)
          .set({ activeRoomId: room.id, updatedAt: new Date() })
          .where(eq(telegramLinks.userId, link.userId));
        await answer(`✅ Active room: ${room.name}`);
      } else {
        await answer("");
      }
    } catch (error) {
      console.error("[panda-chat] bot callback failed", error);
      await answer("Something went wrong").catch(() => undefined);
    }
    void user;
    return;
  }

  const msg = update.message;
  if (!msg) return;
  const chatId = String(msg.chat.id);
  if (msg.chat.type !== "private") return void (await send(chatId, "🐼 Please talk to me in a private chat."));

  const settings = await getSettings();
  const botSettings = await getBotSettings();
  const text = (msg.text ?? msg.caption ?? "").trim();
  const first = text.split(/\s+/)[0] ?? "";
  const cmd = first.startsWith("/") ? first.slice(1).split("@")[0].toLowerCase() : "";
  const arg = text.slice(first.length).trim();
  const media = extractMedia(msg);

  // §6.8 anti-abuse: coarse per-chat command/message rate limit.
  if (cmd || text || media) {
    if (!rateLimit(`tgcmd:${chatId}`, botSettings.commandRatePerMin, 60_000).ok)
      return void (await send(chatId, "⏳ Slow down a little — too many messages per minute."));
  }

  /* Super Admin commands (backup / restore / platform) — only for the configured admin chats */
  const { tryHandleSuperadmin } = await import("./superadmin");
  if (await tryHandleSuperadmin(update)) return;

  const ctx = await linkForChat(chatId);

  /* ---------------- linking ---------------- */
  if (cmd === "start") {
    if (ctx) return void (await send(chatId, await helpText()));
    if (!arg) return void (await send(chatId, await welcomeText()));
    const [codeRow] = await db
      .select({ code: telegramLinkCodes, user: users })
      .from(telegramLinkCodes)
      .innerJoin(users, eq(users.id, telegramLinkCodes.userId))
      .where(eq(telegramLinkCodes.code, arg))
      .limit(1);
    if (!codeRow || codeRow.code.expiresAt.getTime() < Date.now()) {
      if (codeRow) await db.delete(telegramLinkCodes).where(eq(telegramLinkCodes.code, arg));
      return void (await send(chatId, "⌛ That code is invalid or expired.\nGenerate a fresh one on <b>Panda Chat → Account → Telegram</b>."));
    }
    if (!settings.telegramEnabled) return void (await send(chatId, "⛔ The Telegram integration is currently disabled by the administrator."));
    if (codeRow.user.status !== "active") return void (await send(chatId, "⛔ This Panda Chat account is suspended."));
    if (settings.telegramPaid && !codeRow.user.canUseTelegram)
      return void (
        await send(
          chatId,
          "🔒 <b>Bot access is a premium feature.</b>\nAsk the administrator to enable Telegram for your account, then try the code again.",
        )
      );
    const [busy] = await db
      .select({ userId: telegramLinks.userId })
      .from(telegramLinks)
      .where(eq(telegramLinks.chatId, chatId))
      .limit(1);
    if (busy && busy.userId !== codeRow.user.id)
      return void (await send(chatId, "This Telegram chat is already linked to another Panda Chat account.\nOpen the website with that account and disconnect it first."));

    const name = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") || "Telegram user";
    const handle = msg.from?.username ? ` (@${msg.from.username})` : "";
    const [firstRoom] = await db
      .select({ id: rooms.id })
      .from(rooms)
      .where(eq(rooms.ownerId, codeRow.user.id))
      .orderBy(desc(rooms.lastActivityAt))
      .limit(1);
    await db
      .insert(telegramLinks)
      .values({
        userId: codeRow.user.id,
        chatId,
        chatName: `${name}${handle}`.slice(0, 128),
        username: msg.from?.username?.slice(0, 64) ?? null,
        activeRoomId: firstRoom?.id ?? null,
      })
      .onConflictDoUpdate({
        target: telegramLinks.userId,
        set: {
          chatId,
          chatName: `${name}${handle}`.slice(0, 128),
          username: msg.from?.username?.slice(0, 64) ?? null,
          activeRoomId: firstRoom?.id ?? null,
          updatedAt: new Date(),
        },
      });
    await db.delete(telegramLinkCodes).where(eq(telegramLinkCodes.userId, codeRow.user.id));
    return void (await send(chatId, `✅ <b>Linked!</b> Your account is now connected to this chat.\n\n${await helpText()}`));
  }

  /* ---------------- fallback routing (§6.4) ----------------
   * UNLINKED chats: a non-command message (text or media) is delivered to the
   * platform's default room when the admin enabled it — otherwise the welcome
   * notice. Known commands never fall through, and the bot's own replies are
   * never routed (messages sent BY the bot do not appear in getUpdates). */
  if (!ctx) {
    if (!cmd && (text || media)) {
      return void (await routeFallbackMessage(bot.token, msg, botSettings));
    }
    return void (await send(chatId, await welcomeText()));
  }
  const { link, user } = ctx;
  if (user.status !== "active") return void (await send(chatId, "⛔ Your Panda Chat account is suspended."));
  if (!settings.telegramEnabled) return void (await send(chatId, "⛔ The Telegram integration is currently disabled by the administrator."));
  if (settings.telegramPaid && !user.canUseTelegram)
    return void (await send(chatId, "🔒 Bot access is a premium feature — ask the administrator to re-enable it for your account."));

  const baseUrl = (settings.publicUrl || process.env.APP_URL || "").replace(/\/+$/, "");
  const inviteUrl = (t: string) => `${baseUrl}/r/${t}`;

  const pickRoom = async (): Promise<Room | null> => {
    if (!link.activeRoomId) return null;
    const room = await getRoomById(link.activeRoomId);
    if (!room || room.ownerId !== link.userId) return null;
    return room;
  };
  const needRoom = async (): Promise<Room | null> => {
    const room = await pickRoom();
    if (room) return room;
    // Convenience: an owner with exactly one room never has to pick it first.
    const owned = await db
      .select({ id: rooms.id })
      .from(rooms)
      .where(eq(rooms.ownerId, link.userId))
      .orderBy(desc(rooms.lastActivityAt))
      .limit(2);
    if (owned.length === 1) {
      const [room] = await Promise.all([getRoomById(owned[0].id)]);
      if (room) {
        await db
          .update(telegramLinks)
          .set({ activeRoomId: room.id, updatedAt: new Date() })
          .where(eq(telegramLinks.userId, link.userId));
        link.activeRoomId = room.id;
        return room;
      }
    }
    await send(chatId, "No active room. Send /rooms and pick the room you want to manage — or /help for everything else.");
    return null;
  };

  switch (cmd) {
    case "help":
      return void (await send(chatId, await helpText(await isBotAdmin(chatId))));
    case "me": {
      const [c] = await db.select({ n: sql<number>`count(*)::int` }).from(rooms).where(eq(rooms.ownerId, link.userId));
      return void (await send(
        chatId,
        [
          "<b>🐼 Your account</b>",
          "",
          `👤 <b>${esc(user.displayName)}</b> · <code>@${esc(user.username)}</code>`,
          `🚪 Rooms: <b>${c?.n ?? 0}</b>`,
          `🔔 Forwarding: <b>${link.forwardEnabled ? "on" : "paused"}</b>`,
          `🔕 Muted rooms: <b>${link.mutedRooms.length}</b>`,
          settings.telegramPaid ? "💎 Bot access: <b>premium</b>" : "",
        ]
          .filter(Boolean)
          .join("\n"),
      ));
    }
    case "rooms": {
      const list = await db.select().from(rooms).where(eq(rooms.ownerId, link.userId)).orderBy(desc(rooms.lastActivityAt)).limit(20);
      if (list.length === 0) return void (await send(chatId, "You have no rooms yet — create one on the website first."));
      const keyboard = list.map((r) => [
        { text: `${link.activeRoomId === r.id ? "📍 " : ""}${r.name}`, callback_data: `room:${r.id}` },
      ]);
      return void (await send(chatId, "<b>🚪 Your rooms</b>\n\nPick the room the commands will act on:", {
        reply_markup: { inline_keyboard: keyboard },
      }));
    }
    case "status": {
      const room = await needRoom();
      if (!room) return;
      const [c] = await db
        .select({
          members: sql<number>`(count(*) filter (where ${roomMembers.role} = 'guest' and ${roomMembers.status} = 'active' and ${roomMembers.nickname} is not null))::int`,
          online: sql<number>`(count(*) filter (where ${roomMembers.role} = 'guest' and ${roomMembers.status} = 'active' and ${roomMembers.nickname} is not null and ${roomMembers.lastSeenAt} > now() - interval '45 seconds'))::int`,
          banned: sql<number>`(count(*) filter (where ${roomMembers.status} = 'banned'))::int`,
        })
        .from(roomMembers)
        .where(eq(roomMembers.roomId, room.id));
      const [m] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(messages)
        .where(and(eq(messages.roomId, room.id), isNull(messages.deletedAt), ne(messages.authorRole, "system")));
      return void (await send(
        chatId,
        [
          `<b>📊 ${esc(room.name)}</b>`,
          room.description ? `<i>${esc(room.description)}</i>` : "",
          "",
          `👥 Members: <b>${c?.members ?? 0}</b> (${c?.online ?? 0} online, ${c?.banned ?? 0} removed)`,
          `💬 Messages: <b>${m?.n ?? 0}</b>`,
          `🔑 Password: <b>${room.passwordHash ? "on" : "off"}</b>`,
          `🔒 Locked: <b>${room.isLocked ? "yes" : "no"}</b>`,
          `🔔 Notifications: <b>${link.mutedRooms.includes(room.id) ? "muted" : "on"}</b>`,
        ]
          .filter((l, i) => l !== "" || i === 2)
          .join("\n"),
      ));
    }
    case "online": {
      const room = await needRoom();
      if (!room) return;
      const online = await db
        .select({ nickname: roomMembers.nickname, role: roomMembers.role })
        .from(roomMembers)
        .where(
          and(
            eq(roomMembers.roomId, room.id),
            eq(roomMembers.status, "active"),
            sql`${roomMembers.nickname} is not null`,
            sql`${roomMembers.lastSeenAt} > now() - interval '45 seconds'`,
          ),
        )
        .limit(50);
      if (online.length === 0) return void (await send(chatId, "Nobody is online right now."));
      return void (await send(
        chatId,
        `<b>🟢 Online in ${esc(room.name)}</b>\n\n${online.map((o) => `${o.role === "owner" ? "👑" : "•"} ${esc(o.nickname ?? "")}`).join("\n")}`,
      ));
    }
    case "link": {
      const room = await needRoom();
      if (!room) return;
      return void (await send(chatId, `🔗 Invite link for <b>${esc(room.name)}</b>:\n${inviteUrl(room.inviteToken)}`));
    }
    case "newlink": {
      const room = await needRoom();
      if (!room) return;
      const fresh = await rotateInvite(room.id);
      return void (await send(chatId, `🔁 New invite link generated. The old link no longer works.\n${inviteUrl(fresh)}`));
    }
    case "lock": {
      const room = await needRoom();
      if (!room) return;
      await setRoomLocked(room.id, true);
      return void (await send(chatId, "🔒 Room locked. Members can read, only you can send messages."));
    }
    case "unlock": {
      const room = await needRoom();
      if (!room) return;
      await setRoomLocked(room.id, false);
      return void (await send(chatId, "🔓 Room unlocked. Everyone can send messages again."));
    }
    case "password": {
      const room = await needRoom();
      if (!room) return;
      await tg(bot.token, "deleteMessage", { chat_id: chatId, message_id: msg.message_id }).catch(() => undefined);
      if (arg.length < 4) return void (await send(chatId, "Usage: <code>/password new-password</code> (at least 4 characters)"));
      await setRoomPassword(room.id, arg.slice(0, 128));
      return void (await send(chatId, "🔑 Password updated — everyone must enter the new password.\n<i>I deleted your message to keep the password private.</i>"));
    }
    case "nopassword": {
      const room = await needRoom();
      if (!room) return;
      await setRoomPassword(room.id, null);
      return void (await send(chatId, "🔓 Password removed. Anyone with the invite link can join."));
    }
    case "members": {
      const room = await needRoom();
      if (!room) return;
      const list = await db
        .select()
        .from(roomMembers)
        .where(and(eq(roomMembers.roomId, room.id), eq(roomMembers.role, "guest"), sql`${roomMembers.nickname} is not null`))
        .orderBy(desc(roomMembers.lastSeenAt))
        .limit(50);
      if (list.length === 0) return void (await send(chatId, "Nobody has joined yet. Share the link with /link."));
      const now = Date.now();
      const lines = list.map((mem) => {
        const state = mem.status === "banned" ? "🚫 removed" : now - mem.lastSeenAt.getTime() < 45_000 ? "🟢 online" : "⚪️";
        return `<code>${shortId(mem.id)}</code> · ${esc(mem.nickname ?? "")} ${state}`;
      });
      return void (await send(chatId, `<b>👥 Members</b>\n\n${lines.join("\n")}\n\nUse /kick &lt;id&gt; or /unban &lt;id&gt;.`));
    }
    case "kick":
    case "unban": {
      const room = await needRoom();
      if (!room) return;
      const member = arg ? await findMemberByShortId(room.id, arg) : null;
      if (!member) return void (await send(chatId, `Usage: <code>/${cmd} id</code> — see /members for IDs.`));
      await setMemberStatus(room.id, member.id, cmd === "kick" ? "banned" : "active");
      return void (await send(
        chatId,
        cmd === "kick" ? `🚫 ${esc(member.nickname ?? "Member")} was removed.` : `✅ ${esc(member.nickname ?? "Member")} can join again.`,
      ));
    }
    case "recent": {
      const room = await needRoom();
      if (!room) return;
      // E2EE history is unreadable for the bot (and must stay that way).
      if (room.e2eeEnabled)
        return void (await send(chatId, "🔒 That conversation is end-to-end encrypted — history is only readable inside the web app."));
      const n = Math.min(30, Math.max(1, Number(arg) || 10));
      const recent = (
        await db
          .select()
          .from(messages)
          .where(and(eq(messages.roomId, room.id), isNull(messages.deletedAt), ne(messages.authorRole, "system")))
          .orderBy(desc(messages.id))
          .limit(n)
      ).reverse();
      if (recent.length === 0) return void (await send(chatId, "No messages yet."));
      return void (await send(
        chatId,
        `<b>🕘 Recent messages</b>\n\n${recent.map((r) => `<b>${esc(r.authorName)}:</b> ${esc(snippet(r.body, 300))}`).join("\n")}`,
      ));
    }
    case "clear": {
      const room = await needRoom();
      if (!room) return;
      if (arg.toLowerCase() !== "confirm")
        return void (await send(chatId, "⚠️ This deletes every message for everyone.\nSend <code>/clear confirm</code> to continue."));
      await clearRoom(room.id);
      return void (await send(chatId, "🧹 Chat history cleared."));
    }
    case "mute":
    case "unmute": {
      const room = await needRoom();
      if (!room) return;
      const muted = link.mutedRooms.includes(room.id);
      if (cmd === "mute" && !muted) {
        await db
          .update(telegramLinks)
          .set({ mutedRooms: [...link.mutedRooms, room.id], updatedAt: new Date() })
          .where(eq(telegramLinks.userId, link.userId));
        return void (await send(chatId, `🔕 <b>${esc(room.name)}</b> muted. I will stop forwarding its messages.\n/unmute to resume.`));
      }
      if (cmd === "unmute" && muted) {
        await db
          .update(telegramLinks)
          .set({ mutedRooms: link.mutedRooms.filter((r) => r !== room.id), updatedAt: new Date() })
          .where(eq(telegramLinks.userId, link.userId));
        return void (await send(chatId, `🔔 <b>${esc(room.name)}</b> unmuted — notifications are back on.`));
      }
      return void (await send(chatId, cmd === "mute" ? "This room is already muted." : "This room is not muted."));
    }
    case "muteall":
    case "unmuteall":
      await db
        .update(telegramLinks)
        .set({ forwardEnabled: cmd === "unmuteall", updatedAt: new Date() })
        .where(eq(telegramLinks.userId, link.userId));
      return void (await send(chatId, cmd === "muteall" ? "🔕 Forwarding paused for ALL rooms. /unmuteall to resume." : "🔔 Forwarding resumed for all rooms."));
    case "rename": {
      const room = await needRoom();
      if (!room) return;
      const name = arg.replace(/\s+/g, " ").slice(0, 60);
      if (!name) return void (await send(chatId, "Usage: <code>/rename New room name</code>"));
      await renameRoom(room.id, name);
      return void (await send(chatId, `✏️ Room renamed to <b>${esc(name)}</b>.`));
    }
    case "send": {
      // §6.1 — explicit post-to-room (text or media), with reply threading.
      if (!botSettings.allowRoomSend) return void (await send(chatId, "⛔ Sending to rooms via the bot is disabled by the administrator."));
      const room = await needRoom();
      if (!room) return;
      if (room.e2eeEnabled) return void (await send(chatId, "🔒 That conversation is end-to-end encrypted — send messages from the web app."));
      if (room.isLocked) return void (await send(chatId, "🔒 The room is locked — only the website can post right now."));
      const body = arg;
      if (!body && !media) return void (await send(chatId, "Usage: <code>/send your message</code> — or just send me any message/photo/document without a command."));
      const ownerMember = await getOwnerMember(room, user);
      const fileId = media ? await storeTgMedia(bot.token, room.id, ownerMember.id, media) : null;
      let replyToId: number | null = null;
      if (msg.reply_to_message) {
        const [target] = await db
          .select({ id: messages.id })
          .from(messages)
          .where(and(eq(messages.roomId, room.id), eq(messages.tgMessageId, msg.reply_to_message.message_id)))
          .limit(1);
        replyToId = target?.id ?? null;
      }
      await postMessage(
        room,
        { memberId: ownerMember.id, nickname: user.displayName, role: "owner", authorName: user.displayName },
        body.slice(0, settings.maxMessageLength),
        replyToId,
        "telegram",
        fileId,
      );
      return void (await send(chatId, "✓ Posted to the room", { disable_notification: true }));
    }
    case "msg": {
      // §6.2 — private message to another LINKED account (opt-in by receiver).
      if (!botSettings.allowBotDm) return void (await send(chatId, "⛔ Bot direct messages are disabled by the administrator."));
      const [rawName, ...rest] = arg.split(/\s+/);
      const body = rest.join(" ").trim();
      if (!rawName || !body) return void (await send(chatId, "Usage: <code>/msg username your message</code>"));
      const uname = rawName.replace(/^@/, "").toLowerCase();
      if (uname === user.username) return void (await send(chatId, "That's you 🙂 — messages to yourself aren't needed."));
      const [peer] = await db.select().from(users).where(eq(users.username, uname)).limit(1);
      if (!peer || peer.status !== "active") return void (await send(chatId, "No active Panda Chat account with that username."));
      const [peerLink] = await db.select().from(telegramLinks).where(eq(telegramLinks.userId, peer.id)).limit(1);
      if (!peerLink) return void (await send(chatId, "That user hasn't connected their Telegram to Panda Chat yet."));
      if (!peerLink.allowBotDm)
        return void (await send(chatId, "That user hasn't enabled bot DMs — they can switch it on in <b>Account → Telegram → Allow private bot messages</b>."));
      const dm = await findOrCreateDm(user, peer);
      if (dm.e2eeEnabled) return void (await send(chatId, "🔒 That conversation is end-to-end encrypted — send messages from the web app."));
      const ownerMember = await getOwnerMember(dm, user);
      const posted = await postMessage(
        dm,
        { memberId: ownerMember.id, nickname: user.displayName, role: "owner", authorName: user.displayName },
        body.slice(0, settings.maxMessageLength),
        null,
        "telegram",
      );
      // Deliver to the receiver's Telegram chat with a reply-thread mapping so
      // their answer lands back in the SAME conversation (§6.3).
      try {
        const sent = await tg<{ message_id: number }>(bot.token, "sendMessage", {
          chat_id: peerLink.chatId,
          text: `✉️ <b>${esc(user.displayName)}</b> (@${esc(user.username)}) sent you a private message:\n\n${esc(body.slice(0, 3000))}\n\n<i>Reply to this message to answer them.</i>`,
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
        });
        await db.update(messages).set({ tgMessageId: sent.message_id }).where(eq(messages.id, posted.id));
      } catch (error) {
        console.error("[panda-chat] bot /msg delivery failed", error);
      }
      return void (await send(chatId, `✓ Sent to <b>${esc(peer.displayName)}</b>`, { disable_notification: true }));
    }
    case "setdefault": {
      // §6.4 — admins set the PLATFORM default room; users set their OWN fallback.
      const admin = await isBotAdmin(chatId);
      if (!arg) {
        const [platformRoom] = botSettings.defaultRoomId ? await db.select({ name: rooms.name }).from(rooms).where(eq(rooms.id, botSettings.defaultRoomId)).limit(1) : [];
        const [ownRoom] = link.fallbackRoomId ? await db.select({ name: rooms.name }).from(rooms).where(eq(rooms.id, link.fallbackRoomId)).limit(1) : [];
        return void (await send(
          chatId,
          [
            "<b>🧭 Default routing</b>",
            "",
            `Platform fallback: <b>${botSettings.fallbackEnabled ? "on" : "off"}</b>${platformRoom?.name ? ` → ${esc(platformRoom.name)}` : ""}`,
            `Your fallback room: <b>${ownRoom?.name ? esc(ownRoom.name) : "not set"}</b>`,
            `Active room: <b>${link.activeRoomId ? "set via /rooms" : "not set"}</b>`,
            "",
            admin
              ? "As an admin: <code>/setdefault &lt;room-id&gt;</code> sets the platform default · <code>/setdefault off</code> disables it."
              : "<code>/setdefault &lt;room-id&gt;</code> sets where YOUR unmatched messages go · <code>/setdefault off</code> clears it.",
          ].join("\n"),
        ));
      }
      if (arg.toLowerCase() === "off" || arg.toLowerCase() === "none") {
        if (admin) {
          await updateBotSettings({ defaultRoomId: null, fallbackEnabled: false });
          await audit("telegram.setdefault", { details: "platform fallback disabled" }).catch(() => undefined);
          return void (await send(chatId, "✅ Platform fallback routing disabled."));
        }
        await db.update(telegramLinks).set({ fallbackRoomId: null, updatedAt: new Date() }).where(eq(telegramLinks.userId, link.userId));
        return void (await send(chatId, "✅ Your fallback room was cleared."));
      }
      // Resolve the target room: a full UUID, or an exact name among the user's rooms.
      let target: Room | null = null;
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(arg) ? arg : null;
      if (uuid) {
        const room = await getRoomById(uuid);
        target = room && (admin || room.ownerId === link.userId) ? room : null;
      } else {
        const [owned] = await db
          .select()
          .from(rooms)
          .where(and(eq(rooms.ownerId, link.userId), eq(rooms.name, arg.slice(0, 80))))
          .limit(1);
        target = owned ?? null;
        if (!target && admin) {
          const [any] = await db.select().from(rooms).where(eq(rooms.name, arg.slice(0, 80))).limit(1);
          target = any ?? null;
        }
      }
      if (!target || target.type === "dm") return void (await send(chatId, "Room not found. Copy the room id from the website, or use the exact room name you own."));
      if (target.e2eeEnabled) return void (await send(chatId, "🔒 Encrypted conversations cannot be a bot routing destination."));
      if (admin) {
        await updateBotSettings({ defaultRoomId: target.id, fallbackEnabled: true });
        await audit("telegram.setdefault", { targetType: "room", targetId: target.id, details: `platform default → ${target.name}` }).catch(() => undefined);
        return void (await send(chatId, `✅ Platform default room: <b>${esc(target.name)}</b>\nUnmatched messages from unlinked chats now land there.`));
      }
      await db.update(telegramLinks).set({ fallbackRoomId: target.id, updatedAt: new Date() }).where(eq(telegramLinks.userId, link.userId));
      return void (await send(chatId, `✅ Your fallback room: <b>${esc(target.name)}</b> — your unmatched messages go there.`));
    }
    case "settings": {
      const flag = arg.toLowerCase();
      if (flag === "dmon" || flag === "dmoff") {
        await db.update(telegramLinks).set({ allowBotDm: flag === "dmon", updatedAt: new Date() }).where(eq(telegramLinks.userId, link.userId));
        return void (await send(chatId, flag === "dmon" ? "✅ Other linked users can now reach you with <b>/msg</b>." : "✅ Bot direct messages are now closed for your account."));
      }
      const [activeRoom] = link.activeRoomId ? await db.select({ name: rooms.name }).from(rooms).where(eq(rooms.id, link.activeRoomId)).limit(1) : [];
      const [fallbackRoom] = link.fallbackRoomId ? await db.select({ name: rooms.name }).from(rooms).where(eq(rooms.id, link.fallbackRoomId)).limit(1) : [];
      return void (await send(
        chatId,
        [
          "<b>⚙️ Your bot settings</b>",
          "",
          `🔔 Forwarding: <b>${link.forwardEnabled ? "on" : "paused"}</b> (<code>/muteall</code> / <code>/unmuteall</code>)`,
          `📍 Active room: <b>${activeRoom?.name ? esc(activeRoom.name) : "not set"}</b> (<code>/rooms</code>)`,
          `🧭 Your fallback room: <b>${fallbackRoom?.name ? esc(fallbackRoom.name) : "not set"}</b> (<code>/setdefault</code>)`,
          `✉️ Private bot messages: <b>${link.allowBotDm ? "allowed" : "closed"}</b> (<code>/settings dmon</code> / <code>/settings dmoff</code>)`,
          `🔕 Muted rooms: <b>${link.mutedRooms.length}</b>`,
        ].join("\n"),
      ));
    }
    case "unlink":
      await db.delete(telegramLinks).where(eq(telegramLinks.userId, link.userId));
      return void (await send(chatId, "👋 This chat was disconnected. You can link again from the Panda Chat website."));
    case "del":
    case "delete": {
      const room = await needRoom();
      if (!room) return;
      const replied = msg.reply_to_message?.message_id;
      const [target] = replied
        ? await db
            .select({ id: messages.id })
            .from(messages)
            .where(and(eq(messages.roomId, room.id), eq(messages.tgMessageId, replied)))
            .limit(1)
        : [];
      if (!target) return void (await send(chatId, "Reply to a forwarded message with /del to delete it."));
      const ok = await softDeleteMessage(room.id, target.id);
      return void (await send(chatId, ok ? "🗑 Deleted from the room." : "That message was already deleted."));
    }
    default: {
      if (cmd) return void (await send(chatId, "Unknown command. Send /help to see what I can do."));

      /* §6.3 — Reply threading: a reply to ANY bot-delivered message resolves
       * back to its original conversation (room OR DM), not just the active
       * room. The tg_message_id mapping persists in the DB, so threads survive
       * restarts and never lose their link. */
      if (msg.reply_to_message?.message_id) {
        const [target] = await db
          .select({ id: messages.id, roomId: messages.roomId })
          .from(messages)
          .where(eq(messages.tgMessageId, msg.reply_to_message.message_id))
          .limit(1);
        if (target) {
          const targetRoom = await getAccessibleRoom(link.userId, target.roomId);
          if (targetRoom && !targetRoom.e2eeEnabled && !targetRoom.isDisabled) {
            const member = await getOwnerMember(targetRoom, user);
            const fileId = media ? await storeTgMedia(bot.token, targetRoom.id, member.id, media) : null;
            await postMessage(
              targetRoom,
              { memberId: member.id, nickname: user.displayName, role: "owner", authorName: user.displayName },
              text.slice(0, settings.maxMessageLength),
              target.id,
              "telegram",
              fileId,
            );
            return void (await send(chatId, "✓ Reply delivered", { disable_notification: true }));
          }
        }
      }

      if (!text && !media) return void (await send(chatId, "Only text and media messages are supported for now."));

      // Destination: active room → personal fallback → clear error (never a
      // mystery drop). E2EE rooms are rejected with an explicit message.
      let room = await needRoom();
      if (!room && link.fallbackRoomId) {
        const fb = await getRoomById(link.fallbackRoomId);
        if (fb && fb.ownerId === link.userId) room = fb;
      }
      if (!room) return;
      if (room.e2eeEnabled) return void (await send(chatId, "🔒 That conversation is end-to-end encrypted — send messages from the web app."));
      if (room.isLocked) return void (await send(chatId, "🔒 The room is locked — messages can't be posted right now."));

      const ownerMember = await getOwnerMember(room, user);
      const fileId = media ? await storeTgMedia(bot.token, room.id, ownerMember.id, media) : null;
      let replyToId: number | null = null;
      if (msg.reply_to_message) {
        const [target] = await db
          .select({ id: messages.id })
          .from(messages)
          .where(and(eq(messages.roomId, room.id), eq(messages.tgMessageId, msg.reply_to_message.message_id)))
          .limit(1);
        replyToId = target?.id ?? null;
      }
      await postMessage(
        room,
        { memberId: ownerMember.id, nickname: user.displayName, role: "owner", authorName: user.displayName },
        text.slice(0, settings.maxMessageLength),
        replyToId,
        "telegram",
        fileId,
      );
      await tg(bot.token, "setMessageReaction", {
        chat_id: chatId,
        message_id: msg.message_id,
        reaction: [{ type: "emoji", emoji: "👍" }],
      }).catch(() => send(chatId, "✓ Posted to the room", { disable_notification: true }));
    }
  }
}

/* ------------------------------------------------------------------ */
/* Fallback routing (§6.4)                                             */
/* ------------------------------------------------------------------ */

/** Delivers a message from an UNLINKED Telegram chat into the default room. */
async function routeFallbackMessage(token: string, msg: TgMessage, botSettings: Awaited<ReturnType<typeof getBotSettings>>): Promise<void> {
  const chatId = String(msg.chat.id);
  const send = (text: string) =>
    tg(token, "sendMessage", {
      chat_id: chatId,
      text: text.slice(0, 4000),
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
    }).catch(() => undefined);

  if (!botSettings.fallbackEnabled) return void (await send(await welcomeText()));

  // No destination configured → REFUSE the message (never deliver to a guess).
  const room = botSettings.defaultRoomId ? await getRoomById(botSettings.defaultRoomId) : null;
  if (!room || room.type !== "room" || room.isDisabled || room.e2eeEnabled) {
    return void (await send("⚠️ The administrator hasn't set a default room for this bot yet, so your message can't be delivered. Please ask them to configure one."));
  }

  // Stable per-chat member row (device hash scoped to this Telegram chat).
  const deviceHash = `tg:${chatId}`.slice(0, 80);
  const nickname = ([msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") || "Telegram user").slice(0, 32);
  let [member] = await db
    .select()
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, room.id), eq(roomMembers.deviceHash, deviceHash)))
    .limit(1);
  if (!member) {
    const [created] = await db
      .insert(roomMembers)
      .values({ roomId: room.id, deviceHash, nickname, role: "guest", passwordVersion: room.passwordVersion })
      .onConflictDoUpdate({ target: [roomMembers.roomId, roomMembers.deviceHash], set: { nickname, status: "active", lastSeenAt: new Date() } })
      .returning();
    member = created;
  } else if (member.status === "banned") {
    return void (await send("⛔ You can't post to the default room."));
  }

  const text = (msg.text ?? msg.caption ?? "").trim();
  const media = extractMedia(msg);
  const fileId = media ? await storeTgMedia(token, room.id, member.id, media) : null;
  if (!text && !fileId) return void (await send("Only text and media messages are supported."));

  const settings = await getSettings();
  await postMessage(
    room,
    { memberId: member.id, nickname, role: "guest", authorName: nickname },
    text.slice(0, settings.maxMessageLength),
    null,
    "telegram",
    fileId,
  );

  const ack = botSettings.fallbackAckText.replace("{room}", esc(room.name)) || "✓";
  await send(ack);
}
