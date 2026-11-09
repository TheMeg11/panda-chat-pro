import { sql } from "drizzle-orm";
import { db } from "@/db";
import { files, messages, roomMembers, rooms, telegramBots, telegramLinks, users } from "@/db/schema";
import {
  allowedChatIds,
  getLastBackupResult,
  getBackupConfig,
  restoreFromBackup,
  runBackup,
  unpackBackup,
} from "@/lib/backup";
import { getPlatformBot, tg } from "./platform";
import { linkForChat, type TgUpdate } from "./service";

/**
 * Super Admin commands carried by the official platform bot.
 *
 * Only chats listed in the backup configuration (Super Admin panel → Backups,
 * or the SUPERADMIN_CHAT_ID / BACKUP_CHAT_ID env vars) may use them:
 *   /status /platform /backup /restore /cancel
 *
 * /restore starts a 15-minute window; the operator then sends the .pcbak
 * documents (multi-part archives are reassembled automatically), reviews the
 * summary and confirms. Confirming wipes the current tables and replays the
 * backup inside one transaction.
 */

const RESTORE_WINDOW_MS = 15 * 60_000;

type RestoreSession = {
  chatId: string;
  parts: Map<number, Buffer>;
  total: number | null;
  baseName: string;
  bytes: number;
  expiresAt: number;
};

type PendingRestore = { chatId: string; bytes: Buffer; sha256: string; counts: Record<string, number>; createdAt: string };

const g = globalThis as typeof globalThis & {
  __pcSuperadmin?: {
    restoreSession: RestoreSession | null;
    pending: PendingRestore | null;
    busy: boolean;
  };
};

function state() {
  g.__pcSuperadmin ??= { restoreSession: null, pending: null, busy: false };
  return g.__pcSuperadmin;
}

async function api<T = unknown>(method: string, payload: Record<string, unknown>): Promise<T | null> {
  const bot = await getPlatformBot();
  if (!bot.configured) return null;
  try {
    return await tg<T>(bot.token, method, payload, AbortSignal.timeout(60_000));
  } catch (error) {
    console.error(`[panda-chat] superadmin bot ${method} error:`, (error as Error).message);
    return null;
  }
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function send(chatId: string | number, text: string, extra: Record<string, unknown> = {}) {
  return api("sendMessage", {
    chat_id: chatId,
    text: text.slice(0, 4000),
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...extra,
  });
}

async function isAllowed(chatId: string): Promise<boolean> {
  return (await allowedChatIds()).includes(chatId);
}

export const ADMIN_COMMANDS = [
  { command: "platform", description: "Platform status (admin)" },
  { command: "backup", description: "Create and send a backup now" },
  { command: "restore", description: "Restore from a backup file" },
  { command: "cancel", description: "Cancel a pending restore" },
];

async function adminHelpText(): Promise<string> {
  const config = await getBackupConfig();
  return [
    "<b>🛡 Panda Chat — Super Admin</b>",
    "",
    "This bot carries the platform backups. Nightly archives land here automatically.",
    "",
    "<b>/platform</b> — data & storage overview, last backup",
    "<b>/backup</b> — create and send a backup right now",
    "<b>/restore</b> — restore from a backup file you send next",
    "<b>/cancel</b> — cancel a pending restore",
    "",
    `⏰ Auto backup: <b>${String(config.hour).padStart(2, "0")}:00</b> (Tehran) · ${config.enabled ? "enabled" : "disabled"}`,
    config.chatId ? `📨 Destination chat: <code>${esc(config.chatId)}</code>` : "⚠️ No destination chat configured",
  ].join("\n");
}

async function statusText(): Promise<string> {
  const [[u], [r], [m], [f], [mb], [l], [b], dbSize] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(users),
    db.select({ n: sql<number>`count(*)::int` }).from(rooms),
    db.select({ n: sql<number>`count(*)::int` }).from(messages),
    db.select({ n: sql<number>`count(*)::int`, bytes: sql<number>`coalesce(sum(size),0)::bigint` }).from(files),
    db.select({ n: sql<number>`count(*)::int` }).from(roomMembers),
    db.select({ n: sql<number>`count(*)::int` }).from(telegramLinks),
    db.select({ n: sql<number>`count(*)::int` }).from(telegramBots),
    db.execute(sql`select pg_database_size(current_database())::bigint as size`),
  ]);
  const size = Number((dbSize?.rows as Array<{ size: string | number }> | undefined)?.[0]?.size ?? 0);
  const last = await getLastBackupResult();
  const lines = [
    "<b>📊 Platform status</b>",
    "",
    `👥 Users: <b>${u.n}</b> · 🚪 Rooms: <b>${r.n}</b> · 👤 Members: <b>${mb.n}</b>`,
    `💬 Messages: <b>${m.n}</b> · 📎 Files: <b>${f.n}</b> (${(Number(f.bytes) / 1048576).toFixed(1)} MB)`,
    `🔗 Telegram links: <b>${l.n}</b> · 🤖 Legacy room bots: <b>${b.n}</b>`,
    `🗄 Database size: <b>${(size / 1048576).toFixed(1)} MB</b>`,
    "",
  ];
  if (last) {
    lines.push(
      last.ok
        ? `✅ Last backup: <b>${esc(last.at)}</b> — ${last.parts} part(s), ${(last.bytes / 1048576).toFixed(2)} MB`
        : `❌ Last backup attempt failed: ${esc(last.error ?? "unknown")}`,
    );
  } else {
    lines.push("ℹ️ No backup has run yet.");
  }
  return lines.join("\n");
}

/* ------------------------------------------------------------------ */
/* Restore flow                                                        */
/* ------------------------------------------------------------------ */

function resetRestore() {
  state().restoreSession = null;
  state().pending = null;
}

async function downloadDocument(fileId: string): Promise<Buffer | null> {
  const bot = await getPlatformBot();
  if (!bot.configured) return null;
  try {
    const info = await api<{ file_path?: string }>("getFile", { file_id: fileId });
    if (!info?.file_path) return null;
    const res = await fetch(`https://api.telegram.org/file/bot${bot.token}/${info.file_path}`, {
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch (error) {
    console.error("[panda-chat] restore download failed", error);
    return null;
  }
}

async function handleDocument(chatId: string, msg: NonNullable<TgUpdate["message"]>) {
  const session = state().restoreSession;
  if (!session || session.chatId !== chatId) {
    return void (await send(chatId, "⚠️ Send /restore first, then attach the backup file(s)."));
  }
  if (Date.now() > session.expiresAt) {
    resetRestore();
    return void (await send(chatId, "⌛ The restore window expired. Send /restore to start again."));
  }
  const doc = msg.document;
  if (!doc || !doc.file_name?.endsWith(".pcbak")) {
    return void (await send(chatId, "❓ That is not a <code>.pcbak</code> backup file. Send /cancel to abort."));
  }

  const match = /\.part(\d+)of(\d+)\.pcbak$/i.exec(doc.file_name);
  if (match) {
    session.total = Number(match[2]);
  } else {
    session.total = 1;
  }

  if (doc.file_size && doc.file_size > 20 * 1024 * 1024) {
    return void (await send(chatId, "❌ This part is larger than the 20MB Telegram download limit. Create a new backup with smaller parts."));
  }
  const bytes = await downloadDocument(doc.file_id);
  if (!bytes) return void (await send(chatId, "❌ Could not download that file. Please resend it."));

  session.parts.set(match ? Number(match[1]) : 1, bytes);
  session.bytes += bytes.length;
  const have = session.parts.size;
  const total = session.total ?? 1;
  await send(chatId, `📥 Received part <b>${have}/${total}</b> (${(bytes.length / 1048576).toFixed(2)} MB).`);
  if (have < total) return;

  // All parts present — reassemble and validate.
  const ordered: Buffer[] = [];
  for (let i = 1; i <= total; i++) {
    const part = session.parts.get(i);
    if (!part) return void (await send(chatId, `❌ Missing part ${i}. Please resend it.`));
    ordered.push(part);
  }
  const full = Buffer.concat(ordered);
  try {
    const { payload } = unpackBackup(full);
    const counts = payload.counts ?? {};
    state().pending = { chatId, bytes: full, sha256: "", counts, createdAt: payload.createdAt };
    state().restoreSession = null;
    await send(
      chatId,
      [
        "<b>🧾 Backup validated</b>",
        "",
        `_created_ ${esc(payload.createdAt)}`,
        `👥 users: <b>${counts.users ?? 0}</b> · 🚪 rooms: <b>${counts.rooms ?? 0}</b> · 👤 members: <b>${counts.roomMembers ?? 0}</b>`,
        `💬 messages: <b>${counts.messages ?? 0}</b> · 📎 files: <b>${counts.files ?? 0}</b> · 🔗 links: <b>${counts.telegramLinks ?? 0}</b>`,
        `🗄 audit entries: <b>${counts.auditLogs ?? 0}</b> · ⚙️ settings: <b>${counts.platformSettings ?? 0}</b>`,
        "",
        "⚠️ <b>Restoring replaces EVERYTHING currently in the database</b> (users, rooms, messages, files).",
        "The nightly backup schedule itself is kept.",
      ].join("\n"),
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "✅ Restore now", callback_data: "rb:confirm" },
              { text: "✖ Cancel", callback_data: "rb:cancel" },
            ],
          ],
        },
      },
    );
  } catch (error) {
    resetRestore();
    await send(chatId, `❌ Invalid backup archive: ${esc((error as Error).message)}`);
  }
}

async function finalizeRestore(chatId: string) {
  const pending = state().pending;
  if (!pending || pending.chatId !== chatId) return;
  if (state().busy) return void (await send(chatId, "⏳ A restore is already in progress…"));
  state().busy = true;
  await api("sendChatAction", { chat_id: chatId, action: "typing" });
  try {
    const summary = await restoreFromBackup(pending.bytes);
    resetRestore();
    await send(
      chatId,
      [
        "✅ <b>Restore complete</b>",
        "",
        `_from backup_ ${esc(summary.createdAt)}`,
        `👥 ${summary.counts.users ?? 0} users · 🚪 ${summary.counts.rooms ?? 0} rooms · 💬 ${summary.counts.messages ?? 0} messages · 📎 ${summary.counts.files ?? 0} files`,
        "",
        "All sessions were wiped; the platform bot reconnects automatically within a minute.",
      ].join("\n"),
    );
  } catch (error) {
    console.error("[panda-chat] restore failed", error);
    await send(chatId, `❌ <b>Restore failed:</b> ${esc((error as Error).message).slice(0, 800)}\n\nThe database is unchanged.`);
  } finally {
    state().busy = false;
  }
}

/* ------------------------------------------------------------------ */
/* Update routing — consumes the admin half, forwards the rest         */
/* ------------------------------------------------------------------ */

/**
 * Handles everything that belongs to the Super Admin flow and returns true.
 * False means "not an admin update" — the caller should run the user bot.
 */
export async function tryHandleSuperadmin(update: TgUpdate): Promise<boolean> {
  /* restore confirmation buttons */
  if (update.callback_query) {
    const cq = update.callback_query;
    if (!cq.data?.startsWith("rb:")) return false;
    const chatId = String(cq.message?.chat.id ?? cq.from.id);
    if (!(await isAllowed(chatId))) return false;
    const answer = (text: string) => api("answerCallbackQuery", { callback_query_id: cq.id, text }).catch(() => undefined);
    if (cq.data === "rb:confirm") {
      await answer("Restoring…");
      await finalizeRestore(chatId);
    } else if (cq.data === "rb:cancel") {
      resetRestore();
      await answer("Cancelled");
      await send(chatId, "✖ Restore cancelled. Nothing was changed.");
    }
    return true;
  }

  const msg = update.message;
  if (!msg || msg.chat.type !== "private") return false;
  const chatId = String(msg.chat.id);
  if (!(await isAllowed(chatId))) return false; // silent for strangers

  // Backup documents: only during a restore window (or an obvious .pcbak file).
  const doc = msg.document;
  if (doc && (state().restoreSession?.chatId === chatId || doc.file_name?.endsWith(".pcbak"))) {
    await handleDocument(chatId, msg);
    return true;
  }

  const text = (msg.text ?? "").trim();
  const cmd = text.startsWith("/") ? text.slice(1).split(/[\s@]/)[0].toLowerCase() : "";

  switch (cmd) {
    case "platform": {
      await send(chatId, await statusText());
      return true;
    }
    case "backup": {
      await send(chatId, "🗄 Building a fresh backup…");
      const result = await runBackup("manual");
      if (result.ok) await send(chatId, `✅ Backup sent: ${result.parts} part(s), ${(result.bytes / 1048576).toFixed(2)} MB.`);
      else await send(chatId, `❌ Backup failed: ${esc(result.error ?? "unknown")}`);
      return true;
    }
    case "restore": {
      state().restoreSession = {
        chatId,
        parts: new Map(),
        total: null,
        baseName: "",
        bytes: 0,
        expiresAt: Date.now() + RESTORE_WINDOW_MS,
      };
      state().pending = null;
      await send(
        chatId,
        [
          "♻️ <b>Restore mode</b> — send the <code>.pcbak</code> backup file(s) now.",
          "Multi-part archives: attach every part (any order); they are reassembled automatically.",
          "You will get a summary and must confirm before anything is changed.",
          "",
          "Send /cancel to abort.",
        ].join("\n"),
      );
      return true;
    }
    case "cancel": {
      if (state().restoreSession || state().pending) {
        resetRestore();
        await send(chatId, "✖ Cancelled. Nothing was changed.");
        return true;
      }
      return false; // let the user flow answer
    }
    case "help":
    case "start":
    case "status": {
      // Admin variants win only while the chat is not linked to a user account.
      const linked = await linkForChat(chatId);
      if (linked) return false;
      if (cmd === "status") await send(chatId, await statusText());
      else await send(chatId, await adminHelpText());
      return true;
    }
    default:
      return false;
  }
}

/** Registers the admin command menu for the configured admin chats. */
export async function registerAdminCommands() {
  const chats = await allowedChatIds();
  const bot = await getPlatformBot();
  if (!bot.configured || chats.length === 0) return;
  for (const chatId of chats) {
    await tg(bot.token, "setMyCommands", {
      commands: ADMIN_COMMANDS,
      scope: { type: "chat", chat_id: chatId },
    }).catch(() => undefined);
  }
}
