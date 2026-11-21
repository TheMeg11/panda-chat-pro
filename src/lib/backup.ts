import { createHash } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { desc, eq, getTableColumns, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  auditLogs,
  deletedAccounts,
  files,
  messages,
  platformSettings,
  roomMembers,
  rooms,
  users,
} from "@/db/schema";
import { audit } from "./audit";
import {
  backupKeyFingerprint,
  decryptBackup,
  deriveBackupKey,
  encryptBackup,
  isEncryptedBackup,
} from "./backup-crypto";

/**
 * Full-platform backup & restore — WEB-BASED (v2.6.0).
 *
 * The admin panel offers two buttons and nothing runs in the background:
 *  - DOWNLOAD: packs ALL durable data — users, rooms, members, messages,
 *    uploaded media (base64), platform settings and the audit log — into one
 *    gzipped JSON archive, encrypts it with AES-256-GCM (BACKUP_ENCRYPTION_KEY
 *    or a domain-separated APP_SECRET key) and streams the single .pcbak.enc
 *    file to the administrator's browser.
 *  - RESTORE: uploads a previously downloaded archive; the current tables are
 *    wiped and the archive replayed inside one transaction — including legacy
 *    plaintext (v3) archives — then account-deletion tombstones are re-applied
 *    so emergency-deleted accounts stay deleted.
 *
 * Ephemeral tables (sessions, admin_sessions) are deliberately NOT backed up.
 */

const BACKUP_FORMAT = "panda-chat-backup";
const BACKUP_VERSION = 4;
const TZ = "Asia/Tehran";

export type BackupResult = {
  at: string;
  ok: boolean;
  bytes: number;
  sha256: string;
  error?: string;
  counts?: Record<string, number>;
};

const LAST_RESULT_KEY = "pc_backup_last";

/* ------------------------------------------------------------------ */
/* Key management                                                      */
/* ------------------------------------------------------------------ */

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
  const [userRows, roomRows, memberRows, fileRows, messageRows, settingsRows, auditRows, tombstoneRows] = await Promise.all([
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
/* Download (build the encrypted archive)                              */
/* ------------------------------------------------------------------ */

export type BackupArchive = {
  filename: string;
  bytes: Buffer;
  sha256: string;
  counts: Record<string, number>;
  createdAt: string;
};

let building = false;

/** Builds the encrypted single-file archive the admin downloads. */
export async function buildBackupArchive(): Promise<BackupArchive> {
  if (building) throw new Error("A backup is already being built");
  building = true;
  try {
    const payload = await buildPayload();
    const json = Buffer.from(JSON.stringify(payload), "utf8");
    const gz = gzipSync(json, { level: 6 });
    // ENCRYPT at rest — the archive is meant to be stored OFF the server.
    const key = backupEncryptionKey();
    const enc = encryptBackup(key, gz);
    const sha = createHash("sha256").update(enc).digest("hex");
    await recordLastResult({
      at: new Date().toISOString(),
      ok: true,
      bytes: enc.length,
      sha256: sha,
      counts: payload.counts,
    });
    await audit("backup.download", {
      details: `bytes=${enc.length} sha256=${sha.slice(0, 12)}`,
    }).catch(() => undefined);
    return {
      filename: `panda-backup-${stamp()}.pcbak.enc`,
      bytes: enc,
      sha256: sha,
      counts: payload.counts,
      createdAt: payload.createdAt,
    };
  } finally {
    building = false;
  }
}

async function recordLastResult(result: BackupResult) {
  await db
    .insert(platformSettings)
    .values({ key: LAST_RESULT_KEY, value: result })
    .onConflictDoUpdate({ target: platformSettings.key, set: { value: result, updatedAt: new Date() } });
}

export async function getLastBackupResult(): Promise<BackupResult | null> {
  const [row] = await db.select().from(platformSettings).where(eq(platformSettings.key, LAST_RESULT_KEY)).limit(1);
  return (row?.value as BackupResult | undefined) ?? null;
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

function reviveRows(rows: unknown[], table?: Parameters<typeof getTableColumns>[0]): Record<string, unknown>[] {
  // Archives older than v2.6.0 carry telegram columns (tgMessageId,
  // canUseTelegram, …) that no longer exist — drop anything the current
  // schema does not know so an old backup still restores cleanly.
  const allowed = table ? new Set(Object.keys(getTableColumns(table))) : null;
  return (rows ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) {
      if (allowed && !allowed.has(k) && k !== "__b64") continue;
      if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(v)) out[k] = new Date(v);
      else out[k] = v;
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
 * Backups older than v2.6.0 may contain telegram tables — those rows are
 * ignored (the tables no longer exist).
 */
export async function restoreFromBackup(bytes: Buffer): Promise<RestoreSummary> {
  const { payload } = unpackBackup(bytes);
  const t = payload.tables;

  await db.transaction(async (tx) => {
    await tx.execute(
      sql`truncate table messages, files, room_members, rooms, users, platform_settings, audit_logs restart identity cascade`,
    );

    for (const row of reviveRows(t.users ?? [], users)) await tx.insert(users).values(row as never);
    for (const row of reviveRows(t.rooms ?? [], rooms)) await tx.insert(rooms).values(row as never);
    for (const row of chunk(reviveRows(t.roomMembers ?? [], roomMembers), 200))
      await tx.insert(roomMembers).values(row as never);
    for (const row of reviveRows(t.files ?? [], files)) {
      if (row.__b64 && typeof row.data === "string") row.data = Buffer.from(row.data as string, "base64");
      else if (row.data && typeof row.data === "object" && Array.isArray((row.data as { data?: unknown }).data))
        row.data = Buffer.from((row.data as { data: number[] }).data);
      delete row.__b64;
      await tx.insert(files).values(row as never);
    }
    for (const row of chunk(reviveRows(t.messages ?? [], messages), 300)) await tx.insert(messages).values(row as never);
    for (const row of reviveRows(t.platformSettings ?? [], platformSettings)) await tx.insert(platformSettings).values(row as never);
    for (const row of chunk(reviveRows(t.auditLogs ?? [], auditLogs), 300)) await tx.insert(auditLogs).values(row as never);
    // Merge the archive's deletion tombstones with the ones already on this
    // install (the table is NOT truncated) — deletions must outlive restores.
    for (const row of reviveRows(t.deletedAccounts ?? [], deletedAccounts)) {
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
  (globalThis as typeof globalThis & { __pcRateLimit?: Map<string, unknown> }).__pcRateLimit?.clear();

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
