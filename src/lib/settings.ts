import { db } from "@/db";
import { platformSettings } from "@/db/schema";

export type PlatformSettings = {
  registrationOpen: boolean;
  maintenanceMode: boolean;
  announcement: string;
  defaultMaxRooms: number;
  maxMessageLength: number;
  telegramEnabled: boolean;
  /** when true, linking the Telegram bot requires the admin-granted access (paid mode) */
  telegramPaid: boolean;
  publicUrl: string;
};

export const DEFAULT_SETTINGS: PlatformSettings = {
  registrationOpen: true,
  maintenanceMode: false,
  announcement: "",
  defaultMaxRooms: 20,
  maxMessageLength: 2000,
  telegramEnabled: true,
  telegramPaid: true,
  publicUrl: "",
};

const g = globalThis as typeof globalThis & { __pcSettings?: { value: PlatformSettings; at: number } };

export async function getSettings(): Promise<PlatformSettings> {
  const cached = g.__pcSettings;
  if (cached && Date.now() - cached.at < 3000) return cached.value;
  const value: PlatformSettings = { ...DEFAULT_SETTINGS };
  try {
    const rows = await db.select().from(platformSettings);
    for (const row of rows) {
      const key = row.key as keyof PlatformSettings;
      if (key in DEFAULT_SETTINGS && typeof row.value === typeof DEFAULT_SETTINGS[key]) {
        (value as Record<string, unknown>)[key] = row.value;
      }
    }
  } catch (error) {
    console.error("[panda-chat] failed to load platform settings", error);
  }
  g.__pcSettings = { value, at: Date.now() };
  return value;
}

export async function updateSettings(patch: Partial<PlatformSettings>) {
  for (const [key, val] of Object.entries(patch)) {
    if (!(key in DEFAULT_SETTINGS) || val === undefined) continue;
    await db
      .insert(platformSettings)
      .values({ key, value: val })
      .onConflictDoUpdate({ target: platformSettings.key, set: { value: val, updatedAt: new Date() } });
  }
  g.__pcSettings = undefined;
}

export function roomLimitFor(user: { maxRooms: number | null }, settings: PlatformSettings) {
  return user.maxRooms ?? settings.defaultMaxRooms;
}
