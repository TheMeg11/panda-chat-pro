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
  findMemberByShortId,
  getOwnerMember,
  getRoomById,
  renameRoom,
  rotateInvite,
  setMemberStatus,
  setRoomLocked,
  setRoomPassword,
} from "../rooms";
import { getSettings } from "../settings";
import { shortId } from "../utils";
import { tg } from "./platform";

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

function helpText(admin = false) {
  return [
    "<b>🐼 Panda Chat bot</b>",
    "",
    "Messages from your rooms arrive here. <b>Reply</b> to any of them to answer in the room, or send a message to post it to your active room.",
    "",
    ...BOT_COMMANDS.map((c) => `/${c.command} — ${esc(c.description)}`),
    "/del — reply to a message with /del to delete it from the room",
    ...(admin ? ["", "<b>🛡 Super Admin</b>", "/backup /restore /platform — server management"] : []),
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
type TgMessage = {
  message_id: number;
  chat: { id: number; type: string; first_name?: string };
  from?: TgUser;
  text?: string;
  document?: { file_id: string; file_name?: string; file_size?: number };
  reply_to_message?: { message_id: number };
};
export type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  callback_query?: { id: string; from: TgUser; data?: string; message?: TgMessage };
};

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
  const text = (msg.text ?? "").trim();
  const first = text.split(/\s+/)[0] ?? "";
  const cmd = first.startsWith("/") ? first.slice(1).split("@")[0].toLowerCase() : "";
  const arg = text.slice(first.length).trim();

  /* Super Admin commands (backup / restore / platform) — only for the configured admin chats */
  const { tryHandleSuperadmin } = await import("./superadmin");
  if (await tryHandleSuperadmin(update)) return;

  const ctx = await linkForChat(chatId);

  /* ---------------- linking ---------------- */
  if (cmd === "start") {
    if (ctx) return void (await send(chatId, helpText()));
    if (!arg) return void (await send(chatId, PUBLIC_NOTICE));
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
    return void (await send(chatId, `✅ <b>Linked!</b> Your account is now connected to this chat.\n\n${helpText()}`));
  }

  if (!ctx) return void (await send(chatId, PUBLIC_NOTICE));
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
      return void (await send(chatId, helpText()));
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
      if (!text) return void (await send(chatId, "Only text messages are supported for now."));
      const room = await needRoom();
      if (!room) return;
      const ownerMember = await getOwnerMember(room, user);
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
      );
      await tg(bot.token, "setMessageReaction", {
        chat_id: chatId,
        message_id: msg.message_id,
        reaction: [{ type: "emoji", emoji: "👍" }],
      }).catch(() => send(chatId, "✓ Posted to the room", { disable_notification: true }));
    }
  }
}
