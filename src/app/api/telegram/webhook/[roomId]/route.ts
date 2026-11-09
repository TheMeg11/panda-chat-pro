import { tryHandleSuperadmin } from "@/lib/telegram/superadmin";
import { handleUpdate, type TgUpdate } from "@/lib/telegram/service";

export const dynamic = "force-dynamic";

/**
 * Webhook delivery for the official platform bot (TELEGRAM_MODE=webhook).
 * Verified with Telegram's secret_token header against WEBHOOK_SECRET.
 * The default deployment uses long polling; this route only matters when a
 * webhook is configured manually.
 */
export async function POST(req: Request) {
  const secret = (process.env.WEBHOOK_SECRET || "").trim();
  const header = req.headers.get("x-telegram-bot-api-secret-token") ?? "";
  if (!secret || header !== secret) return new Response("Forbidden", { status: 403 });
  const update = (await req.json().catch(() => null)) as TgUpdate | null;
  if (update && typeof update.update_id === "number") {
    try {
      if (!(await tryHandleSuperadmin(update))) await handleUpdate(update);
    } catch (error) {
      console.error("[panda-chat] webhook update failed", error);
    }
  }
  return Response.json({ ok: true });
}
