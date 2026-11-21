import { isUserActive, NOTIFY_WINDOW_MS } from "../activity";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { platformSettings } from "@/db/schema";
import { getSettings } from "../settings";
import { sweepAnnouncements, sweepOfflineNotifications } from "./offline-notify";
import { getPlatformBot, recordPlatformBotError, tg, TelegramError } from "./platform";
import { BOT_COMMANDS, handleUpdate, type TgUpdate } from "./service";
import { registerAdminCommands, tryHandleSuperadmin } from "./superadmin";

/**
 * Long-polling manager for the ONE official platform bot.
 * The loop restarts automatically when the token is changed in the admin panel,
 * the platform toggle flips, or Telegram rejects the token.
 * Works on any long-running Node server without a public HTTPS endpoint.
 */
type Loop = { token: string; stop: () => void };
type PollerState = { loop: Loop | null; syncing: boolean; startedAt: number };

const OFFSET_KEY = "pc_tg_last_update_id";

const g = globalThis as typeof globalThis & { __pcPoller?: PollerState; __pcPollerSync?: () => void; __pcOfflineSweep?: boolean };

function unref(timer: unknown) {
  (timer as { unref?: () => void })?.unref?.();
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      resolve();
    });
  });
}

/**
 * Offline-notify sweep (§5.5): every 5 minutes, in the SAME periodic system
 * as the poller loop — no second poller. It runs even when polling is disabled
 * (webhook deployments) because it only makes outbound sendMessage calls and
 * never consumes Telegram updates.
 *
 * Cost tier B/C (2026-11-21): the sweep is IDLE-GATED — while no user touched
 * the app within NOTIFY_WINDOW_MS, the tick returns before its two settings
 * lookups, so an idle serverless container emits zero outbound packets and
 * can actually sleep. The window is wider than the digest's own 15-minute
 * eligibility delay, so digests that become eligible shortly after the last
 * web request still fire.
 */
function ensureOfflineNotifySweep() {
  if (g.__pcOfflineSweep) return;
  g.__pcOfflineSweep = true;
  unref(
    setInterval(() => {
      if (!isUserActive(NOTIFY_WINDOW_MS)) return;
      void sweepOfflineNotifications().catch((error) => console.error("[panda-chat] offline notify sweep failed", error));
      void sweepAnnouncements().catch((error) => console.error("[panda-chat] announcement sweep failed", error));
    }, 5 * 60_000),
  );
}

export function ensurePoller() {
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  ensureOfflineNotifySweep();
  if (g.__pcPoller) return;
  if (process.env.TELEGRAM_POLLING === "off") return;
  const state: PollerState = { loop: null, syncing: false, startedAt: Date.now() };
  g.__pcPoller = state;
  g.__pcPollerSync = () => void sync(state);
  unref(setTimeout(() => void sync(state), 1000));
  // Cost tier B: 15s → 60s. Every tick costs two DB round-trips (settings +
  // bot token), which on a serverless plan both adds load and keeps the
  // container from ever sleeping. 60s still reacts to admin changes quickly.
  unref(setInterval(() => void sync(state), 60_000));
}

export function pollerStatus() {
  const state = g.__pcPoller;
  return { started: Boolean(state), running: state?.loop ? 1 : 0, startedAt: state?.startedAt ?? null };
}

async function sync(state: PollerState) {
  if (state.syncing) return;
  state.syncing = true;
  try {
    const [settings, bot] = await Promise.all([getSettings(), getPlatformBot()]);
    // A recorded token error (rejected token) keeps the bot down until the
    // admin saves a fresh token — saving clears the error and restarts the loop.
    const want = settings.telegramEnabled && bot.configured && !bot.lastError ? bot.token : null;

    if (state.loop && (want === null || want !== state.loop.token)) {
      state.loop.stop();
      state.loop = null;
    }
    if (want && !state.loop) {
      state.loop = startLoop(want);
      void configureBot(want);
    }
  } catch (error) {
    console.error("[panda-chat] telegram poller sync failed", error);
  } finally {
    state.syncing = false;
  }
}

/** Registers the slash-command menus once per bot token. */
async function configureBot(token: string) {
  try {
    await tg(token, "setMyCommands", { commands: BOT_COMMANDS });
    await tg(token, "setMyShortDescription", { short_description: "Private Panda Chat room control center" }).catch(() => undefined);
    await registerAdminCommands().catch(() => undefined);
  } catch (error) {
    console.error("[panda-chat] bot configure failed", error);
  }
}

function startLoop(token: string): Loop {
  const controller = new AbortController();
  let stopped = false;
  let offset = 0;
  let failures = 0;
  let offsetLoaded = false;

  // §6.7 — offset persistence: restarts never reprocess old updates.
  const loadOffset = async () => {
    if (offsetLoaded) return;
    offsetLoaded = true;
    try {
      const [row] = await db
        .select()
        .from(platformSettings)
        .where(eq(platformSettings.key, OFFSET_KEY))
        .limit(1);
      offset = Number((row?.value as { id?: number } | undefined)?.id ?? 0) || 0;
    } catch {
      /* fresh install */
    }
  };
  const saveOffset = async (id: number) => {
    try {
      await db
        .insert(platformSettings)
        .values({ key: OFFSET_KEY, value: { id } })
        .onConflictDoUpdate({ target: platformSettings.key, set: { value: { id }, updatedAt: new Date() } });
    } catch {
      /* best effort */
    }
  };

  void (async () => {
    while (!stopped) {
      try {
        await loadOffset();
        const updates = await tg<TgUpdate[]>(
          token,
          "getUpdates",
          { offset, timeout: 25, allowed_updates: ["message", "callback_query"] },
          AbortSignal.any([controller.signal, AbortSignal.timeout(40_000)]),
        );
        failures = 0;
        for (const update of updates) {
          offset = update.update_id + 1;
          try {
            if (!(await tryHandleSuperadmin(update))) await handleUpdate(update);
          } catch (error) {
            console.error("[panda-chat] telegram update failed", error);
          }
        }
        if (updates.length > 0) await saveOffset(offset - 1);
      } catch (error) {
        if (stopped) break;
        failures += 1;
        const code = error instanceof TelegramError ? error.code : 0;
        if (code === 409) await tg(token, "deleteWebhook", {}).catch(() => undefined);
        if (code === 401 || code === 404) {
          console.error("[panda-chat] telegram rejected the bot token — bot stopped until the token is fixed");
          await recordPlatformBotError("Telegram rejected the bot token (it may have been revoked or replaced).");
          break;
        }
        await sleep(Math.min(60_000, 2_000 * failures), controller.signal);
      }
    }
  })();
  return {
    token,
    stop: () => {
      stopped = true;
      controller.abort();
    },
  };
}
