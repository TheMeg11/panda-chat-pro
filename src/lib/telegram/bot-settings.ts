import { eq } from "drizzle-orm";
import { db } from "@/db";
import { platformSettings } from "@/db/schema";
import { isUuid } from "../utils";

/**
 * Platform-bot settings (§6.5) — everything an admin can tune from the panel:
 * default room for fallback routing, feature toggles, custom texts, bot-DM
 * consent, authorized bot admins and a coarse command rate limit.
 *
 * Stored under platform_settings key `pc_tg_bot`, JSON, cached 5s.
 */

export type TelegramBotSettings = {
  /** fallback routing destination for non-command messages (§6.4) */
  defaultRoomId: string | null;
  /** master switch for fallback routing */
  fallbackEnabled: boolean;
  /** allow linked users to send to rooms via the bot (§6.1) */
  allowRoomSend: boolean;
  /** allow linked users to DM other linked users via /msg (§6.2) */
  allowBotDm: boolean;
  /** custom /start text (HTML allowed, admin-authored) */
  startText: string;
  /** custom /help text (HTML allowed) */
  helpText: string;
  /** auto-reply appended when a fallback message is posted */
  fallbackAckText: string;
  /** Telegram chat ids allowed to use admin commands (/setdefault ...) */
  botAdmins: string[];
  /** max commands per chat per minute */
  commandRatePerMin: number;
};

export const DEFAULT_BOT_SETTINGS: TelegramBotSettings = {
  defaultRoomId: null,
  fallbackEnabled: false,
  allowRoomSend: true,
  allowBotDm: true,
  startText: "",
  helpText: "",
  fallbackAckText: "✓ Delivered to {room}",
  botAdmins: [],
  commandRatePerMin: 20,
};

const KEY = "pc_tg_bot";

const g = globalThis as typeof globalThis & { __pcBotSettings?: { value: TelegramBotSettings; at: number } };

function sanitize(raw: unknown): TelegramBotSettings {
  const v = (raw ?? {}) as Partial<TelegramBotSettings>;
  const admins = Array.isArray(v.botAdmins)
    ? [...new Set(v.botAdmins.map((a) => String(a).replace(/[^0-9-]/g, "").slice(0, 32)).filter(Boolean))]
    : [];
  return {
    defaultRoomId: isUuid(v.defaultRoomId ?? "") ? (v.defaultRoomId as string) : null,
    fallbackEnabled: Boolean(v.fallbackEnabled),
    allowRoomSend: v.allowRoomSend !== false,
    allowBotDm: v.allowBotDm !== false,
    startText: typeof v.startText === "string" ? v.startText.slice(0, 1500) : "",
    helpText: typeof v.helpText === "string" ? v.helpText.slice(0, 3000) : "",
    fallbackAckText: typeof v.fallbackAckText === "string" ? v.fallbackAckText.slice(0, 300) : DEFAULT_BOT_SETTINGS.fallbackAckText,
    botAdmins: admins,
    commandRatePerMin: Number.isFinite(v.commandRatePerMin) ? Math.min(60, Math.max(3, Number(v.commandRatePerMin))) : 20,
  };
}

export async function getBotSettings(): Promise<TelegramBotSettings> {
  const cached = g.__pcBotSettings;
  if (cached && Date.now() - cached.at < 5000) return cached.value;
  let value = DEFAULT_BOT_SETTINGS;
  try {
    const [row] = await db.select().from(platformSettings).where(eq(platformSettings.key, KEY)).limit(1);
    if (row) value = { ...DEFAULT_BOT_SETTINGS, ...sanitize(row.value) };
  } catch {
    /* table not ready */
  }
  g.__pcBotSettings = { value, at: Date.now() };
  return value;
}

export async function updateBotSettings(patch: Partial<TelegramBotSettings>): Promise<TelegramBotSettings> {
  const current = await getBotSettings();
  const next = sanitize({ ...current, ...patch });
  await db
    .insert(platformSettings)
    .values({ key: KEY, value: next })
    .onConflictDoUpdate({ target: platformSettings.key, set: { value: next, updatedAt: new Date() } });
  g.__pcBotSettings = { value: next, at: Date.now() };
  return next;
}

/** Is this Telegram chat id a bot admin? (settings list OR backup chat ids) */
export async function isBotAdmin(chatId: string): Promise<boolean> {
  const settings = await getBotSettings();
  if (settings.botAdmins.includes(chatId)) return true;
  const { allowedChatIds } = await import("../backup");
  const allowed = await allowedChatIds();
  return allowed.includes(chatId);
}
