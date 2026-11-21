import { getSettings } from "../settings";
import { getPlatformBot, tg } from "./platform";
import { BOT_COMMANDS } from "./service";
import { registerAdminCommands } from "./superadmin";

/**
 * Platform-bot webhook mode (cost tier C, 2026-11-21).
 *
 * Long polling keeps an HTTP connection open to Telegram ~every 25 seconds —
 * constant outbound traffic that makes sleeping (serverless) impossible. In
 * webhook mode (TELEGRAM_POLLING=off) Telegram delivers updates to
 * /api/telegram/webhook/platform instead: zero traffic while idle, and an
 * incoming update wakes the container by itself.
 *
 * Registration here is IDEMPOTENT (setWebhook with identical parameters just
 * updates the endpoint), so every cold start re-asserts it — a swapped bot
 * token, a rotated WEBHOOK_SECRET or a Telegram-side reset heals itself on
 * the next boot without any admin action.
 *
 * Requires a public HTTPS base URL: the admin-configured settings.publicUrl
 * or the APP_URL env (Railway: chat.kanar.ir). Without one, registration
 * logs a warning and the poller-free deployment simply waits for the admin
 * to register the webhook from the panel (webhook.set action).
 */

const g = globalThis as typeof globalThis & {
  __pcWebhookTried?: boolean;
  __pcPollerSync?: () => void;
};

/** True when the deployment runs in webhook mode (long polling disabled). */
export function webhookModeEnabled(): boolean {
  return process.env.TELEGRAM_POLLING === "off";
}

/** Resolves the public base URL used for the webhook endpoint + invite links. */
export async function publicBaseUrl(): Promise<string> {
  const settings = await getSettings();
  return (settings.publicUrl || process.env.APP_URL || "").replace(/\/+$/, "");
}

export type WebhookResult = { ok: boolean; url?: string; error?: string };

/** Registers (or re-asserts) the platform webhook. Safe to call repeatedly. */
export async function ensurePlatformWebhook(): Promise<WebhookResult> {
  const secret = (process.env.WEBHOOK_SECRET ?? "").trim();
  if (!webhookModeEnabled()) return { ok: false, error: "polling-mode" };
  if (secret.length < 16) {
    if (!g.__pcWebhookTried) console.warn("[panda-chat] webhook mode is on but WEBHOOK_SECRET is missing/short — the webhook endpoint stays disabled");
    g.__pcWebhookTried = true;
    return { ok: false, error: "missing-secret" };
  }

  const bot = await getPlatformBot();
  if (!bot.configured) return { ok: false, error: "bot-not-configured" };

  const base = await publicBaseUrl();
  if (!/^https:\/\/[^\s/]+/i.test(base)) {
    if (!g.__pcWebhookTried) console.warn("[panda-chat] webhook mode is on but no https public URL (settings.publicUrl / APP_URL) — register the webhook from the admin panel");
    g.__pcWebhookTried = true;
    return { ok: false, error: "no-public-url" };
  }

  const url = `${base}/api/telegram/webhook/platform`;
  try {
    await tg(bot.token, "setWebhook", {
      url,
      secret_token: secret,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: false,
      max_connections: 40,
    });
  } catch (error) {
    console.error("[panda-chat] platform webhook registration failed:", error instanceof Error ? error.message : error);
    return { ok: false, url, error: "setWebhook failed" };
  }

  // Same bot cosmetics the poller applied on token change (best effort).
  await tg(bot.token, "setMyCommands", { commands: BOT_COMMANDS }).catch(() => undefined);
  await tg(bot.token, "setMyShortDescription", { short_description: "Private Panda Chat room control center" }).catch(() => undefined);
  await registerAdminCommands().catch(() => undefined);

  console.log(`[panda-chat] platform webhook registered -> ${url}`);
  return { ok: true, url };
}

/**
 * Boot hook (instrumentation.ts): fire-and-forget registration on every cold
 * start, and re-register whenever the bot token changes — savePlatformBotToken()
 * triggers __pcPollerSync, which points here in webhook mode.
 */
export function ensureWebhookMode(): void {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  if (!webhookModeEnabled()) return;
  g.__pcPollerSync = () => void ensurePlatformWebhook();
  void ensurePlatformWebhook();
}
