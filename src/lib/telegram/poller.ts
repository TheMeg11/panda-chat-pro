import { getSettings } from "../settings";
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

const g = globalThis as typeof globalThis & { __pcPoller?: PollerState; __pcPollerSync?: () => void };

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

export function ensurePoller() {
  if (g.__pcPoller) return;
  if (process.env.NEXT_PHASE === "phase-production-build" || process.env.TELEGRAM_POLLING === "off") return;
  const state: PollerState = { loop: null, syncing: false, startedAt: Date.now() };
  g.__pcPoller = state;
  g.__pcPollerSync = () => void sync(state);
  unref(setTimeout(() => void sync(state), 1000));
  unref(setInterval(() => void sync(state), 15_000));
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
  void (async () => {
    while (!stopped) {
      try {
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
