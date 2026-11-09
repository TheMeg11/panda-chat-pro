import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  auditLogs,
  deletedAccounts,
  files,
  messages,
  platformSettings,
  roomMembers,
  rooms,
  telegramBots,
  telegramLinkCodes,
  telegramLinks,
  users,
} from "@/db/schema";
import { audit } from "./audit";
import { getPlatformBot } from "./telegram/platform";
import {
  backupKeyFingerprint,
  decryptBackup,
  deriveBackupKey,
  encryptBackup,
  isEncryptedBackup,
} from "./backup-crypto";

/**
 * Full-platform backup & restore — now with AES-256-GCM AT-REST ENCRYPTION.
 *
 * Every night at a configurable hour (Asia/Tehran) the app packs ALL durable
 * data — users, rooms, members, messages, uploaded media (base64), Telegram
 * integrations, platform settings and the audit log — into one gzipped JSON
 * archive, encrypts it with a dedicated backup key (BACKUP_ENCRYPTION_KEY, or
 * domain-separated from APP_SECRET) and sends it to the owner's private
 * Telegram chat via the super-admin bot. Telegram only ever sees ciphertext.
 *
 * Restoring (/restore in the bot, or a fresh deployment pointing at the same
 * bot) wipes the current tables and replays the archive inside one transaction
 * — including legacy plaintext (v3) archives — then RE-APPLIES account-deletion
 * tombstones so emergency-deleted accounts stay deleted.
 *
 * Ephemeral tables (sessions, admin_sessions) are deliberately NOT backed up.
 */

const BACKUP_FORMAT = "panda-chat-backup";
const BACKUP_VERSION = 4;
/** Telegram bots can DOWNLOAD files up to 20MB via getFile — keep parts below it. */
const PART_BYTES = 17 * 1024 * 1024;
const TZ = "Asia/Tehran";

export type BackupConfig = { enabled: boolean; hour: number; chatId: string };
export type BackupResult = {
  at: string;
  ok: boolean;
  parts: number;
  bytes: number;
  sha256: string;
  error?: string;
  counts?: Record<string, number>;
};

const SETTINGS_KEY = "pc_backup";
const LAST_RESULT_KEY = "pc_backup_last";

type StoredState = { enabled?: boolean; hour?: number; chatId?: string; lastDate?: string };

const g = globalThis as typeof globalThis & {
  __pcBackupState?: { value: StoredState; at: number };
};

async function readState(): Promise<StoredState> {
  const cached = g.__pcBackupState;
  if (cached && Date.now() - cached.at < 10_000) return cached.value;
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.key, SETTINGS_KEY)).limit(1);
  const value = (row?.value as StoredState | undefined) ?? {};
  g.__pcBackupState = { value, at: Date.now() };
  return value;
}

async function writeState(patch: StoredState) {
  const current = await readState();
  const value = { ...current, ...patch };
  await db
    .insert(platformSettings)
    .values({ key: SETTINGS_KEY, value })
    .onConflictDoUpdate({ target: platformSettings.key, set: { value, updatedAt: new Date() } });
  g.__pcBackupState = { value, at: Date.now() };
}

export async function getBackupConfig(): Promise<BackupConfig> {
  const state = await readState();
  const chatId = (state.chatId ?? process.env.SUPERADMIN_CHAT_ID ?? "").trim();
  const hour = Number.isFinite(state.hour) ? Math.min(23, Math.max(0, Number(state.hour))) : 3;
  return { enabled: state.enabled !== false, hour, chatId };
}

export async function saveBackupConfig(patch: Partial<BackupConfig>) {
  const next: StoredState = {};
  if (patch.enabled !== undefined) next.enabled = patch.enabled;
  if (patch.hour !== undefined) next.hour = Math.min(23, Math.max(0, Math.round(patch.hour)));
  if (patch.chatId !== undefined) next.chatId = patch.chatId.trim().replace(/[^0-9-]/g, "").slice(0, 32);
  await writeState(next);
}

export async function getLastBackupResult(): Promise<BackupResult | null> {
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.key, LAST_RESULT_KEY)).limit(1);
  return (row?.value as BackupResult | undefined) ?? null;
}

/** The bot that carries the backups — the official platform bot (panel token, env fallback). */
export async function superadminBotToken(): Promise<string> {
  const bot = await getPlatformBot();
  return bot.configured ? bot.token : "";
}

export function backupChatIds(): string[] {
  // restore/backup commands are accepted from BOTH the env chat id and the
  // configured one, so a fresh deployment can be unlocked even if settings
  // were lost with the database.
  const envId = (process.env.SUPERADMIN_CHAT_ID || "").trim();
  const envAlt = (process.env.BACKUP_CHAT_ID || "").trim();
  return [...new Set([envId, envAlt].filter(Boolean))];
}

/** Allowed Telegram chat ids for the super-admin bot (env + configured). */
export async function allowedChatIds(): Promise<string[]> {
  const config = await getBackupConfig();
  return [...new Set([...backupChatIds(), config.chatId].filter(Boolean))];
}

/** The backup encryption key: BACKUP_ENCRYPTION_KEY (preferred, kept offline) or APP_SECRET-derived. */
export function backupEncryptionKey(): Buffer {
  const custom = (process.env.BACKUP_ENCRYPTION_KEY ?? "").trim();
  return deriveBackupKey(custom || (process.env.APP_SECRET ?? "").trim() || "panda-chat-dev-secret");
}

/** Fingerprint of the active backup key — safe to show in the admin panel. */
export function backupKeyHint(): string {
  return backupKeyFingerprint(backupEncryptionKey());
}

/* ------------------------------------------------------------------ */
/* Snapshot build                                                      */
/* ------------------------------------------------------------------ */

type BackupPayload = {
  app: string;
  version: number;
  createdAt: string;
  counts: Record<string, number>;
  tables: Record<string, unknown[]>;
};

async function buildPayload(): Promise<BackupPayload> {
  const [userRows, roomRows, memberRows, fileRows, messageRows, botRows, linkRows, codeRows, settingsRows, auditRows, tombstoneRows] = await Promise.all([
    db.select().from(users),
    db.select().from(rooms),
    db.select().from(roomMembers),
    db
      .select({
        id: files.id,
        roomId: files.roomId,
        memberId: files.memberId,
        name: files.name,
        mime: files.mime,
        size: files.size,
        data: files.data,
        createdAt: files.createdAt,
        expiresAt: files.expiresAt,
      })
      .from(files),
    db.select().from(messages),
    db.select().from(telegramBots),
    db.select().from(telegramLinks),
    db.select().from(telegramLinkCodes),
    db.select().from(platformSettings),
    db.select().from(auditLogs).orderBy(desc(auditLogs.id)).limit(5000),
    db.select().from(deletedAccounts),
  ]);

  const fileB64 = (data: Buffer | Uint8Array | null | undefined) =>
    data ? Buffer.from(data).toString("base64") : null;

  const tables: Record<string, unknown[]> = {
    users: userRows,
    rooms: roomRows,
    roomMembers: memberRows,
    files: fileRows.map((f) => ({ ...f, data: fileB64(f.data), __b64: true })),
    messages: messageRows,
    telegramBots: botRows,
    telegramLinks: linkRows,
    telegramLinkCodes: codeRows,
    platformSettings: settingsRows.filter((s) => s.key !== LAST_RESULT_KEY),
    auditLogs: auditRows,
    deletedAccounts: tombstoneRows,
  };
  const counts = Object.fromEntries(Object.entries(tables).map(([k, v]) => [k, v.length]));
  return {
    app: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    counts,
    tables,
  };
}

/* ------------------------------------------------------------------ */
/* Telegram document delivery                                          */
/* ------------------------------------------------------------------ */

async function sendDocument(
  token: string,
  chatId: string,
  bytes: Buffer,
  filename: string,
  caption: string,
): Promise<{ ok: boolean; error?: string }> {
  const form = new FormData();
  form.append("chat_id", chatId);
  form.append("caption", caption.slice(0, 1000));
  form.append("parse_mode", "HTML");
  form.append("document", new Blob([new Uint8Array(bytes)]), filename);
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
    const data = (await res.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
    if (!data?.ok) return { ok: false, error: data?.description ?? `HTTP ${res.status}` };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

function tehranDateKey(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const [date, time] = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .format(d)
    .replace(/(\d{4})-(\d{2})-(\d{2})/, "$1$2$3")
    .split(", ");
  const [h, m, s] = (time ?? "000000").split(":");
  return `${date}-${h}${m}${s}`;
}

/* ------------------------------------------------------------------ */
/* Run a backup                                                        */
/* ------------------------------------------------------------------ */

let running = false;

export async function runBackup(reason: "scheduled" | "manual"): Promise<BackupResult> {
  const token = await superadminBotToken();
  const config = await getBackupConfig();
  const chatId = config.chatId || backupChatIds()[0] || "";
  const fail = async (error: string): Promise<BackupResult> => {
    const result: BackupResult = { at: new Date().toISOString(), ok: false, parts: 0, bytes: 0, sha256: "", error };
    await db
      .insert(platformSettings)
      .values({ key: LAST_RESULT_KEY, value: result })
      .onConflictDoUpdate({ target: platformSettings.key, set: { value: result, updatedAt: new Date() } });
    return result;
  };

  if (!token) return fail("No bot token configured (set it in the admin panel or via TELEGRAM_BOT_TOKEN)");
  if (!chatId) return fail("No backup chat id configured");
  if (running) return fail("A backup is already running");
  running = true;

  try {
    const payload = await buildPayload();
    const json = Buffer.from(JSON.stringify(payload), "utf8");
    const gz = gzipSync(json, { level: 6 });
    // ENCRYPT: Telegram must never see plaintext user data (audit §3.6).
    const key = backupEncryptionKey();
    const enc = encryptBackup(key, gz);
    const sha = createHash("sha256").update(enc).digest("hex");
    const base = `panda-backup-${stamp()}`;
    const parts = Math.max(1, Math.ceil(enc.length / PART_BYTES));
    const countsLine = Object.entries(payload.counts)
      .map(([k, v]) => `${k}=${v}`)
      .join(" · ");

    for (let i = 0; i < parts; i++) {
      const slice = enc.subarray(i * PART_BYTES, Math.min(enc.length, (i + 1) * PART_BYTES));
      const name = parts > 1 ? `${base}.part${i + 1}of${parts}.pcbak.enc` : `${base}.pcbak.enc`;
      const caption =
        `🗄 <b>Panda Chat backup</b> (${reason}) · 🔒 <b>AES-256-GCM encrypted</b>\n` +
        `📦 ${parts > 1 ? `part <b>${i + 1}/${parts}</b> · ` : ""}${(enc.length / 1048576).toFixed(2)} MB encrypted · ` +
        `${(json.length / 1048576).toFixed(2)} MB raw\n` +
        `🧾 ${countsLine}\n` +
        `#️⃣ sha256 <code>${sha.slice(0, 16)}…</code>\n` +
        `🔑 key fingerprint <code>${backupKeyFingerprint(key)}</code>`;
      const sent = await sendDocument(token, chatId, slice, name, caption);
      if (!sent.ok) return fail(`sendDocument failed on part ${i + 1}: ${sent.error}`);
    }

    const result: BackupResult = {
      at: new Date().toISOString(),
      ok: true,
      parts,
      bytes: enc.length,
      sha256: sha,
      counts: payload.counts,
    };
    await db
      .insert(platformSettings)
      .values({ key: LAST_RESULT_KEY, value: result })
      .onConflictDoUpdate({ target: platformSettings.key, set: { value: result, updatedAt: new Date() } });
    await writeState({ lastDate: tehranDateKey() });
    await audit(reason === "manual" ? "backup.manual" : "backup.scheduled", {
      details: `parts=${parts} bytes=${gz.length} sha256=${sha.slice(0, 12)}`,
    }).catch(() => undefined);
    console.log(`[panda-chat] backup (${reason}) sent: ${parts} part(s), ${(gz.length / 1048576).toFixed(2)} MB`);
    return result;
  } catch (error) {
    console.error("[panda-chat] backup failed", error);
    return fail((error as Error).message);
  } finally {
    running = false;
  }
}

/** Nightly scheduler: ticks every minute, fires once per Tehran calendar day. */
export function ensureBackupLoop() {
  const g2 = globalThis as typeof globalThis & { __pcBackupLoop?: boolean };
  if (g2.__pcBackupLoop) return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.BACKUP_LOOP === "off") return;
  g2.__pcBackupLoop = true;

  const tick = async () => {
    try {
      if (!(await superadminBotToken())) return;
      const config = await getBackupConfig();
      if (!config.enabled || !(config.chatId || backupChatIds()[0])) return;
      const now = new Date();
      const [hourStr, minuteStr] = new Intl.DateTimeFormat("en-GB", {
        timeZone: TZ,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
        .format(now)
        .split(":");
      const hour = Number(hourStr);
      const minute = Number(minuteStr);
      if (hour !== config.hour || minute >= 10) return;
      const state = await readState();
      if (state.lastDate === tehranDateKey(now)) return;
      await runBackup("scheduled");
    } catch (error) {
      console.error("[panda-chat] backup tick failed", error);
    }
  };
  const timer = setInterval(() => void tick(), 60_000);
  (timer as unknown as { unref?: () => void }).unref?.();
}

/* ------------------------------------------------------------------ */
/* Restore                                                             */
/* ------------------------------------------------------------------ */

/**
 * Unpacks an archive: auto-decrypts PCENC1 (v4) envelopes with the current
 * backup key, accepts legacy plaintext gzip (v3) archives unchanged.
 */
export function unpackBackup(bytes: Buffer): { payload: BackupPayload; json: Buffer } {
  let data = bytes;
  if (isEncryptedBackup(data)) data = decryptBackup(backupEncryptionKey(), data);
  let json: Buffer;
  // Accept both raw gzip archives and plain JSON (tiny imports).
  if (data.length > 2 && data[0] === 0x1f && data[1] === 0x8b) json = gunzipSync(data);
  else json = data;
  const payload = JSON.parse(json.toString("utf8")) as BackupPayload;
  if (payload.app !== BACKUP_FORMAT) throw new Error("This file is not a Panda Chat backup");
  if (payload.version > BACKUP_VERSION) throw new Error(`Backup version ${payload.version} is newer than this app`);
  if (!payload.tables || typeof payload.tables !== "object") throw new Error("Backup archive is missing table data");
  return { payload, json };
}

function decodeCell(value: unknown): unknown {
  // node-postgres returns timestamps as Date via JSON.parse strings — convert
  // ISO strings back to Date for drizzle timestamp columns.
  return value;
}

function reviveRows(rows: unknown[]): Record<string, unknown>[] {
  return (rows ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)) out[k] = new Date(v);
      else out[k] = decodeCell(v);
    }
    return out;
  });
}

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

export type RestoreSummary = { counts: Record<string, number>; createdAt: string; sha256: string };

/**
 * Replaces the whole database with the backup contents, inside one transaction.
 * Backup settings (pc_backup) are preserved from the CURRENT install so the
 * nightly schedule keeps working after a restore.
 */
export async function restoreFromBackup(bytes: Buffer): Promise<RestoreSummary> {
  const { payload } = unpackBackup(bytes);
  const t = payload.tables;

  // current backup settings survive the restore
  const [currentSettingsRow] = await db
    .select()
    .from(platformSettings)
    .where(eq(platformSettings.key, SETTINGS_KEY))
    .limit(1);
  const currentBackupState = currentSettingsRow?.value ?? null;

  await db.transaction(async (tx) => {
    await tx.execute(
      sql`truncate table messages, files, room_members, telegram_links, telegram_link_codes, telegram_bots, rooms, users, platform_settings, audit_logs restart identity cascade`,
    );

    for (const row of reviveRows(t.users ?? [])) await tx.insert(users).values(row as never);
    for (const row of reviveRows(t.rooms ?? [])) await tx.insert(rooms).values(row as never);
    for (const row of chunk(reviveRows(t.roomMembers ?? []), 200))
      await tx.insert(roomMembers).values(row as never);
    for (const row of reviveRows(t.files ?? [])) {
      if (row.__b64 && typeof row.data === "string") row.data = Buffer.from(row.data as string, "base64");
      else if (row.data && typeof row.data === "object" && Array.isArray((row.data as { data?: unknown }).data))
        row.data = Buffer.from((row.data as { data: number[] }).data);
      delete row.__b64;
      await tx.insert(files).values(row as never);
    }
    for (const row of chunk(reviveRows(t.messages ?? []), 300)) await tx.insert(messages).values(row as never);
    for (const row of reviveRows(t.telegramBots ?? [])) await tx.insert(telegramBots).values(row as never);
    for (const row of reviveRows(t.telegramLinks ?? [])) await tx.insert(telegramLinks).values(row as never);
    for (const row of reviveRows(t.telegramLinkCodes ?? [])) await tx.insert(telegramLinkCodes).values(row as never);
    for (const row of reviveRows(t.platformSettings ?? [])) {
      if ((row as { key?: string }).key === SETTINGS_KEY) continue;
      await tx.insert(platformSettings).values(row as never);
    }
    if (currentBackupState) {
      await tx
        .insert(platformSettings)
        .values({ key: SETTINGS_KEY, value: currentBackupState })
        .onConflictDoUpdate({ target: platformSettings.key, set: { value: currentBackupState, updatedAt: new Date() } });
    }
    for (const row of chunk(reviveRows(t.auditLogs ?? []), 300)) await tx.insert(auditLogs).values(row as never);
    // Merge the archive's deletion tombstones with the ones already on this
    // install (the table is NOT truncated) — deletions must outlive restores.
    for (const row of reviveRows(t.deletedAccounts ?? [])) {
      await tx.insert(deletedAccounts).values(row as never).onConflictDoNothing();
    }

    await tx.execute(
      sql`select setval(pg_get_serial_sequence('messages', 'id'), greatest((select coalesce(max(id), 0) from messages), 1))`,
    );
    await tx.execute(
      sql`select setval(pg_get_serial_sequence('audit_logs', 'id'), greatest((select coalesce(max(id), 0) from audit_logs), 1))`,
    );
  });

  // Nuke in-process caches so the new data is visible immediately.
  (globalThis as typeof globalThis & { __pcSettings?: unknown }).__pcSettings = undefined;
  (globalThis as typeof globalThis & { __pcBackupState?: unknown }).__pcBackupState = undefined;
  (globalThis as typeof globalThis & { __pcRateLimit?: Map<string, unknown> }).__pcRateLimit?.clear();
  (globalThis as typeof globalThis & { __pcPollerSync?: () => void }).__pcPollerSync?.();

  // Re-apply the deletion policy for tombstoned users — an emergency-deleted
  // account must NOT resurrect from an older backup.
  let reapplied = 0;
  try {
    const { applyDeletionTombstones } = await import("./account-deletion");
    reapplied = (await applyDeletionTombstones()).reapplied;
  } catch (error) {
    console.error("[panda-chat] tombstone re-application failed", error);
  }

  await audit("backup.restored", {
    details: `createdAt=${payload.createdAt} users=${payload.counts.users ?? 0} rooms=${payload.counts.rooms ?? 0} deletionsReapplied=${reapplied}`,
  }).catch(() => undefined);

  return { counts: payload.counts ?? {}, createdAt: payload.createdAt, sha256: "" };
}

export async function recordBackupSha(sha: string) {
  const last = await getLastBackupResult();
  if (last) await db
    .insert(platformSettings)
    .values({ key: LAST_RESULT_KEY, value: { ...last, sha256: sha } })
    .onConflictDoUpdate({ target: platformSettings.key, set: { value: { ...last, sha256: sha }, updatedAt: new Date() } });
}
