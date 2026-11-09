import { and, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminSessions, auditLogs, files, messages, sessions } from "@/db/schema";
import { audit } from "./audit";
import { getConfig } from "./config";
import { sweepRateLimitBuckets } from "./rate-limit";

/**
 * Background maintenance (one loop per server instance):
 *
 *  1. Hard-deletes uploaded media whose TTL has passed (default 24h) — photos,
 *     videos and large files disappear one day after upload, as required.
 *  2. Hard-deletes SELF-DESTRUCTED messages (expires_at in the past) together
 *     with their attached files — privacy data does not linger server-side.
 *  3. Purges expired sessions and audit logs older than AUDIT_TTL_DAYS (90d).
 *  4. DATA MINIMIZATION: blanks session IP/User-Agent older than
 *     IP_RETENTION_DAYS (30d) — sessions stay valid, the PII doesn't.
 *  5. Sweeps stale distributed rate-limit buckets.
 *  6. Watches total database size. When it crosses the quota trigger
 *     (STORAGE_QUOTA_MB, default 800 MB), the OLDEST chat messages — and their
 *     attached files — are deleted in batches until usage falls back under the
 *     target line, so a full disk on Railway can never take the app down.
 */
export function ensureMaintenance() {
  const g = globalThis as typeof globalThis & { __pcMaintenance?: boolean };
  if (g.__pcMaintenance) return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (process.env.MAINTENANCE_LOOP === "off") return;
  g.__pcMaintenance = true;

  const run = () => {
    void sweep().catch((error) => console.error("[panda-chat] maintenance sweep failed", error));
  };
  const first = setTimeout(run, 30_000);
  const timer = setInterval(run, 10 * 60_000);
  (first as unknown as { unref?: () => void }).unref?.();
  (timer as unknown as { unref?: () => void }).unref?.();
}

export type SweepResult = {
  expiredFiles: number;
  selfDestructedMessages: number;
  prunedMessages: number;
  prunedFiles: number;
  blankedSessionMeta: number;
  rateBuckets: number;
  dbBytes: number;
  quotaBytes: number;
  pruned: boolean;
};

function quotaBytes(): number {
  const mb = Number(process.env.STORAGE_QUOTA_MB);
  return (Number.isFinite(mb) && mb >= 50 ? Math.min(mb, 1_000_000) : 800) * 1024 * 1024;
}

export async function sweep(): Promise<SweepResult> {
  const config = getConfig();

  // 1) expired media (idempotent — also covers files whose message is gone)
  const expired = await db.delete(files).where(lt(files.expiresAt, new Date())).returning({ id: files.id });

  // 2) self-destructed messages + their attachments (hard delete, privacy)
  const destructed = await db
    .select({ id: messages.id, fileId: messages.fileId })
    .from(messages)
    .where(and(isNotNull(messages.expiresAt), lt(messages.expiresAt, new Date())))
    .limit(2000);
  let selfDestructedMessages = 0;
  if (destructed.length > 0) {
    const ids = destructed.map((m) => m.id);
    await db.delete(messages).where(sql`${messages.id} = any(${sql.raw(`array[${ids.join(",")}]::bigint[]`)})`);
    const fileIds = destructed.map((m) => m.fileId).filter((v): v is string => typeof v === "string");
    if (fileIds.length) {
      await db
        .delete(files)
        .where(sql`${files.id} = any(${sql.raw(`array[${fileIds.map((id) => `'${id}'::uuid`).join(",")}]::uuid[]`)})`);
    }
    selfDestructedMessages = ids.length;
  }

  // 3) expired sessions + old audit logs (configurable retention)
  const now = new Date();
  await db.delete(sessions).where(lt(sessions.expiresAt, now));
  await db.delete(adminSessions).where(lt(adminSessions.expiresAt, now));
  await db
    .delete(auditLogs)
    .where(lt(auditLogs.createdAt, new Date(Date.now() - config.auditTtlDays * 86_400_000)));

  // 4) data minimization: blank stale IP/User-Agent on still-valid sessions
  const blanked = await db
    .update(sessions)
    .set({ ip: null, userAgent: null })
    .where(
      and(
        lt(sessions.createdAt, new Date(Date.now() - config.ipRetentionDays * 86_400_000)),
        sql`(${sessions.ip} is not null or ${sessions.userAgent} is not null)`,
      ),
    )
    .returning({ id: sessions.id });

  // 5) stale distributed rate-limit buckets
  const rateBuckets = await sweepRateLimitBuckets();

  // 6) storage guard
  const quota = quotaBytes();
  const trigger = Math.floor(quota * 0.85);
  const target = Math.floor(quota * 0.7);
  let dbBytes = await databaseSize();
  let prunedMessages = 0;
  let prunedFiles = 0;

  while (dbBytes > trigger) {
    const batch = await db
      .select({ id: messages.id, fileId: messages.fileId })
      .from(messages)
      .orderBy(messages.id)
      .limit(500);
    if (batch.length === 0) break;
    const ids = batch.map((m) => m.id);
    await db.delete(messages).where(sql`${messages.id} = any(${sql.raw(`array[${ids.join(",")}]::bigint[]`)})`);
    const fileIds = batch.map((m) => m.fileId).filter((v): v is string => typeof v === "string");
    if (fileIds.length) {
      const gone = await db
        .delete(files)
        .where(sql`${files.id} = any(${sql.raw(`array[${fileIds.map((id) => `'${id}'::uuid`).join(",")}]::uuid[]`)})`)
        .returning({ id: files.id });
      prunedFiles += gone.length;
    }
    prunedMessages += ids.length;
    dbBytes = await databaseSize();
    if (dbBytes <= target) break;
  }

  const result: SweepResult = {
    expiredFiles: expired.length,
    selfDestructedMessages,
    prunedMessages,
    prunedFiles,
    blankedSessionMeta: blanked.length,
    rateBuckets,
    dbBytes,
    quotaBytes: quota,
    pruned: prunedMessages > 0,
  };

  if (result.pruned) {
    console.warn(
      `[panda-chat] storage quota exceeded — pruned ${prunedMessages} old messages and ${prunedFiles} files (db=${(dbBytes / 1048576).toFixed(1)}MB, quota=${(quota / 1048576).toFixed(0)}MB)`,
    );
    await audit("maintenance.storage_prune", { details: `messages=${prunedMessages} files=${prunedFiles} dbMB=${Math.round(dbBytes / 1048576)}` }).catch(() => undefined);
  } else if (expired.length > 0) {
    console.log(`[panda-chat] maintenance: deleted ${expired.length} expired file(s)`);
  }

  return result;
}

async function databaseSize(): Promise<number> {
  const res = await db.execute(sql`select pg_database_size(current_database())::bigint as size`);
  const rows = res.rows as Array<{ size: string | number }>;
  return Number(rows[0]?.size ?? 0);
}
