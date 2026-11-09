import { eq } from "drizzle-orm";
import { db } from "@/db";
import { telegramBots } from "@/db/schema";
import { decryptSecret } from "../crypto";
import { tg } from "./platform";

/**
 * Legacy per-room bots (the old "paste your own token" model).
 * The platform now uses ONE official bot with account links — this module only
 * exists so the Super Admin panel can still disconnect and remove old rows.
 */
export async function teardownBot(roomId: string, notify = true) {
  const [bot] = await db.select().from(telegramBots).where(eq(telegramBots.roomId, roomId)).limit(1);
  if (!bot) return;
  try {
    const token = decryptSecret(bot.tokenEncrypted);
    if (bot.mode === "webhook") await tg(token, "deleteWebhook", {}).catch(() => undefined);
    if (notify && bot.adminChatId) {
      await tg(token, "sendMessage", {
        chat_id: bot.adminChatId,
        text: "🔌 This bot was disconnected from its Panda Chat room.",
      }).catch(() => undefined);
    }
  } catch {
    /* undecryptable token — just delete */
  }
  await db.delete(telegramBots).where(eq(telegramBots.roomId, roomId));
}
