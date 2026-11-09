import { createHmac } from "node:crypto";

/**
 * Centralized, validated configuration.
 *
 * Every environment variable the app reads is declared here exactly once, with
 * a default, a type and a clamp. Nothing else in the codebase may invent
 * unsafe fallbacks for secrets.
 *
 * Security policy:
 *  - DATABASE_URL is always required.
 *  - APP_SECRET is REQUIRED in production (NODE_ENV=production with a real
 *    deployment). The old behaviour — silently deriving the encryption key
 *    from DATABASE_URL — is gone. In development a missing APP_SECRET logs a
 *    loud warning once and falls back to a dev-only derived key so the app
 *    still boots locally.
 */

export type AppConfig = {
  /** true when running in production mode */
  isProduction: boolean;
  /** true when the process runs for `next build` (no side effects allowed) */
  isBuildPhase: boolean;
  /** validated APP_SECRET (never the DATABASE_URL fallback in production) */
  appSecret: string | null;
  /** independently derived backup encryption key (never equal to appSecret) */
  backupKey: Buffer | null;
  /** max upload size in bytes */
  fileMaxBytes: number;
  /** media retention in hours */
  fileTtlHours: number;
  /** storage quota in MB */
  storageQuotaMb: number;
  /** audit log retention in days */
  auditTtlDays: number;
  /** how long session IP/UA are kept before being blanked (days) */
  ipRetentionDays: number;
  /** feature flag: E2EE for direct messages */
  e2eeEnabled: boolean;
  /** feature flag: interactive tutorial */
  tutorialEnabled: boolean;
  /** CSP in report-only mode while tightening (see next.config.ts) */
  cspReportOnly: boolean;
  /** shared secret expected in x-telegram-bot-api-secret-token for webhooks */
  webhookSecret: string | null;
  /** default TTL options offered for self-destructing messages (seconds) */
  selfDestructOptions: number[];
};

const bool = (raw: string | undefined, fallback: boolean): boolean => {
  if (raw === undefined || raw === "") return fallback;
  return !/^(0|false|off|no)$/i.test(raw.trim());
};

const int = (raw: string | undefined, fallback: number, min: number, max: number): number => {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
};

let cached: AppConfig | null = null;
let warnedSecret = false;

/**
 * Validates the environment once per process and returns the typed config.
 * Does NOT throw on missing APP_SECRET during `next build` — the build phase
 * never performs encryption; the runtime does.
 */
export function getConfig(): AppConfig {
  if (cached) return cached;

  const isProduction = process.env.NODE_ENV === "production";
  const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build";

  const envSecret = (process.env.APP_SECRET ?? "").trim();
  const hasDatabase = Boolean((process.env.DATABASE_URL ?? "").trim());

  let appSecret: string | null = null;
  if (envSecret.length >= 16) {
    appSecret = envSecret;
  } else if (isProduction && !isBuildPhase) {
    // Fail fast, fail loud: no encryption without a real secret in production.
    throw new Error(
      "[panda-chat] APP_SECRET is missing or too short (min 16 chars). " +
        "Generate one with `openssl rand -hex 32` and set it in the environment. " +
        "Refusing to fall back to DATABASE_URL-derived keys.",
    );
  } else {
    if (!warnedSecret) {
      warnedSecret = true;
      console.warn(
        "[panda-chat] APP_SECRET is not set — using a DEVELOPMENT-ONLY derived key. " +
          "Set APP_SECRET before deploying; production refuses to boot without it.",
      );
    }
    appSecret = hasDatabase ? process.env.DATABASE_URL! : "panda-chat-dev-secret";
  }

  // Independent domain-separated key for backup encryption. Can be overridden
  // with BACKUP_ENCRYPTION_KEY so backups survive an APP_SECRET rotation.
  const backupKeySource = (process.env.BACKUP_ENCRYPTION_KEY ?? "").trim();
  const backupKey: Buffer | null = appSecret
    ? deriveKey(backupKeySource || appSecret, "panda-chat:backup:v1")
    : null;

  cached = {
    isProduction,
    isBuildPhase,
    appSecret,
    backupKey,
    fileMaxBytes: int(process.env.FILES_MAX_MB, 15, 1, 64) * 1024 * 1024,
    fileTtlHours: int(process.env.FILES_TTL_HOURS, 24, 1, 24 * 30),
    storageQuotaMb: int(process.env.STORAGE_QUOTA_MB, 800, 50, 100_000),
    auditTtlDays: int(process.env.AUDIT_TTL_DAYS, 90, 7, 3650),
    ipRetentionDays: int(process.env.IP_RETENTION_DAYS, 30, 1, 3650),
    e2eeEnabled: bool(process.env.E2EE_ENABLED, true),
    tutorialEnabled: bool(process.env.TUTORIAL_ENABLED, true),
    cspReportOnly: bool(process.env.CSP_REPORT_ONLY, false),
    webhookSecret: (process.env.WEBHOOK_SECRET ?? "").trim() || null,
    selfDestructOptions: [3600, 86_400, 7 * 86_400],
  };
  return cached;
}

/** Test hook — clears the memoized config. */
export function resetConfigCache() {
  cached = null;
}

/**
 * Deterministic key derivation for named purposes (HKDF-style with HMAC).
 * Different labels never produce equal keys, even from the same source secret.
 */
export function deriveKey(secret: string, label: string, length = 32): Buffer {
  return createHmac("sha256", Buffer.from(label, "utf8")).update(secret, "utf8").digest().subarray(0, length);
}
