import { eq } from "drizzle-orm";
import { db } from "@/db";
import { platformSettings } from "@/db/schema";
import { getConfig } from "@/lib/config";
import { getPlatformBot } from "@/lib/telegram/platform";
import { handleUpdate, type TgUpdate } from "@/lib/telegram/service";
import { tryHandleSuperadmin } from "@/lib/telegram/superadmin";
import { safeEqual } from "@/lib/crypto";

export const dynamic = "force-dynamic";

/**
 * Webhook for the ONE official platform bot (§6.7/§6.8).
 *
 * Security:
 *  - Telegram's `x-telegram-bot-api-secret-token` header must match WEBHOOK_SECRET
 *    (constant-time compare); without a configured secret the route is DISABLED
 *    (403) so no unauthenticated update is ever accepted.
 *  - Idempotency: update_id must be strictly greater than the last processed id,
 *    which is persisted in platform settings — a Telegram retry or a restart
 *    can never double-post a message.
 *  - No loop: only USER messages arrive here; messages the bot itself sends are
 *    never delivered back by Telegram.
 */

const OFFSET_KEY = "pc_tg_last_update_id";

async function lastUpdateId(): Promise<number> {
  try {
    const [row] = await db.select().from(platformSettings).where(eq(platformSettings.key, OFFSET_KEY)).limit(1);
    return Number((row?.value as { id?: number } | undefined)?.id ?? 0) || 0;
  } catch {
    return 0;
  }
}

async function saveUpdateId(id: number): Promise<void> {
  try {
    await db
      .insert(platformSettings)
      .values({ key: OFFSET_KEY, value: { id } })
      .onConflictDoUpdate({ target: platformSettings.key, set: { value: { id }, updatedAt: new Date() } });
  } catch {
    /* best effort — Telegram retries are idempotent on our side anyway */
  }
}

export async function POST(req: Request) {
  const secret = getConfig().webhookSecret;
  if (!secret) return Response.json({ ok: false, error: "webhook not configured" }, { status: 403 });

  const header = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!header || !safeEqual(header, secret)) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const bot = await getPlatformBot();
  if (!bot.configured) return Response.json({ ok: true, skipped: "bot not configured" });

  let update: TgUpdate;
  try {
    update = (await req.json()) as TgUpdate;
  } catch {
    return Response.json({ ok: false, error: "bad json" }, { status: 400 });
  }
  if (typeof update?.update_id !== "number") return Response.json({ ok: false, error: "bad update" }, { status: 400 });

  // Idempotency guard (§6.7): drop anything at or below the processed watermark.
  const watermark = await lastUpdateId();
  if (update.update_id <= watermark) return Response.json({ ok: true, duplicate: true });

  try {
    if (!(await tryHandleSuperadmin(update))) await handleUpdate(update);
  } catch (error) {
    console.error("[panda-chat] webhook update failed", error);
  }
  await saveUpdateId(update.update_id);
  return Response.json({ ok: true });
}

/** Admin helper: current webhook watermark. */
export async function webhookWatermark(): Promise<number> {
  return lastUpdateId();
}
