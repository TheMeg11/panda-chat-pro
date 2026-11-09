import { eq } from "drizzle-orm";
import { db } from "@/db";
import { platformSettings } from "@/db/schema";
import { decryptSecret, encryptSecret } from "../crypto";

/**
 * The ONE official Panda Chat bot — Telegram API client + token management.
 *
 * The token is stored encrypted in platform settings (`pc_bot`) and can be
 * changed any time from the Super Admin panel (Telegram & Backup pages).
 * Until an admin saves a token there, the env vars TELEGRAM_BOT_TOKEN /
 * SUPERADMIN_BOT_TOKEN act as fallback so a fresh deployment works out of the box.
 */

const BOT_KEY = "pc_bot";

export class TelegramError extends Error {
  constructor(
    message: string,
    public code: number,
  ) {
    super(message);
  }
}

export const TOKEN_RE = /^\d{5,16}:[A-Za-z0-9_-]{30,64}$/;

export async function tg<T = unknown>(
  token: string,
  method: string,
  payload: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: signal ?? AbortSignal.timeout(15_000),
    cache: "no-store",
  });
  const data = (await res.json().catch(() => null)) as
    | { ok: boolean; result?: T; description?: string; error_code?: number }
    | null;
  if (!data || !data.ok) throw new TelegramError(data?.description ?? `HTTP ${res.status}`, data?.error_code ?? res.status);
  return data.result as T;
}

export function maskToken(token: string) {
  const [id, secret = ""] = token.split(":");
  return `${id}:••••${secret.slice(-4)}`;
}

type StoredBot = {
  tokenEncrypted: string;
  hint: string;
  botId: string;
  botUsername: string;
  botName: string;
  verifiedAt: string;
  lastError: string | null;
};

export type PlatformBot = {
  configured: boolean;
  source: "db" | "env" | "none";
  token: string;
  botUsername: string | null;
  botName: string | null;
  botId: string | null;
  hint: string | null;
  lastError: string | null;
};

const g = globalThis as typeof globalThis & {
  __pcBot?: { value: PlatformBot; at: number };
  __pcEnvMe?: { username: string | null; name: string | null; id: string | null; at: number };
};

function envToken(): string {
  return (process.env.TELEGRAM_BOT_TOKEN || process.env.SUPERADMIN_BOT_TOKEN || "").trim();
}

async function envMe(token: string): Promise<{ username: string | null; name: string | null; id: string | null }> {
  const cached = g.__pcEnvMe;
  if (cached && Date.now() - cached.at < 300_000) return cached;
  let me: { username: string | null; name: string | null; id: string | null } = { username: null, name: null, id: null };
  try {
    const res = await tg<{ id: number; first_name: string; username?: string }>(token, "getMe");
    me = { username: res.username ?? null, name: res.first_name ?? null, id: String(res.id) };
  } catch {
    /* unreachable or rejected — the poller surfaces the error */
  }
  g.__pcEnvMe = { ...me, at: Date.now() };
  return me;
}

export async function getPlatformBot(): Promise<PlatformBot> {
  const cached = g.__pcBot;
  if (cached && Date.now() - cached.at < 5_000) return cached.value;

  const value = await (async (): Promise<PlatformBot> => {
    try {
      const [row] = await db.select().from(platformSettings).where(eq(platformSettings.key, BOT_KEY)).limit(1);
      const stored = row?.value as StoredBot | undefined;
      if (stored?.tokenEncrypted) {
        try {
          return {
            configured: true,
            source: "db",
            token: decryptSecret(stored.tokenEncrypted),
            botUsername: stored.botUsername || null,
            botName: stored.botName || null,
            botId: stored.botId || null,
            hint: stored.hint || null,
            lastError: stored.lastError ?? null,
          };
        } catch {
          /* encrypted with another APP_SECRET — fall through to env */
        }
      }
    } catch {
      /* settings table not ready yet */
    }
    const token = envToken();
    if (!token) return { configured: false, source: "none", token: "", botUsername: null, botName: null, botId: null, hint: null, lastError: null };
    const me = await envMe(token);
    return {
      configured: true,
      source: "env",
      token,
      botUsername: me.username,
      botName: me.name,
      botId: me.id,
      hint: maskToken(token),
      lastError: null,
    };
  })();

  g.__pcBot = { value, at: Date.now() };
  return value;
}

function invalidate() {
  g.__pcBot = undefined;
  g.__pcEnvMe = undefined;
}

function requestPollerSync() {
  (globalThis as typeof globalThis & { __pcPollerSync?: () => void }).__pcPollerSync?.();
}

/** Validates + stores the bot token. Throws TelegramError on rejection. */
export async function savePlatformBotToken(rawToken: string): Promise<{ botUsername: string }> {
  const token = rawToken.trim();
  if (!TOKEN_RE.test(token)) throw new TelegramError("The token does not look valid", 0);
  const me = await tg<{ id: number; is_bot: boolean; first_name: string; username?: string }>(token, "getMe");
  if (!me.is_bot || !me.username) throw new TelegramError("That token does not belong to a bot", 0);

  const stored: StoredBot = {
    tokenEncrypted: encryptSecret(token),
    hint: maskToken(token),
    botId: String(me.id),
    botUsername: me.username,
    botName: me.first_name.slice(0, 128),
    verifiedAt: new Date().toISOString(),
    lastError: null,
  };
  await db
    .insert(platformSettings)
    .values({ key: BOT_KEY, value: stored })
    .onConflictDoUpdate({ target: platformSettings.key, set: { value: stored, updatedAt: new Date() } });
  invalidate();
  requestPollerSync();
  return { botUsername: me.username };
}

/** Removes the stored token (the app falls back to the env token, if any). */
export async function clearPlatformBotToken() {
  await db.delete(platformSettings).where(eq(platformSettings.key, BOT_KEY));
  invalidate();
  requestPollerSync();
}

/** Records a runtime error (rejected token, Telegram unreachable) for the panel. */
export async function recordPlatformBotError(message: string) {
  try {
    const [row] = await db.select().from(platformSettings).where(eq(platformSettings.key, BOT_KEY)).limit(1);
    const stored = row?.value as StoredBot | undefined;
    if (!stored) return;
    const next = { ...stored, lastError: message.slice(0, 400) };
    await db
      .insert(platformSettings)
      .values({ key: BOT_KEY, value: next })
      .onConflictDoUpdate({ target: platformSettings.key, set: { value: next, updatedAt: new Date() } });
    invalidate();
  } catch {
    /* best effort */
  }
}

export async function clearPlatformBotError() {
  try {
    const [row] = await db.select().from(platformSettings).where(eq(platformSettings.key, BOT_KEY)).limit(1);
    const stored = row?.value as StoredBot | undefined;
    if (!stored?.lastError) return;
    const next = { ...stored, lastError: null };
    await db
      .insert(platformSettings)
      .values({ key: BOT_KEY, value: next })
      .onConflictDoUpdate({ target: platformSettings.key, set: { value: next, updatedAt: new Date() } });
    invalidate();
  } catch {
    /* best effort */
  }
}
