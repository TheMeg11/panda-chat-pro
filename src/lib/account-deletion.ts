import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { messages, roomMembers, rooms, telegramLinks, users } from "@/db/schema";
import { audit } from "./audit";
import { getPlatformBot, tg } from "./telegram/platform";

/**
 * Emergency account deletion policy.
 *
 * Deletion means:
 *  - the user row and every owned room/member/file/message cascade away,
 *  - guest messages in OTHER people's rooms are anonymized ("Deleted user"),
 *  - the Telegram link is severed with a final notice,
 *  - a tombstone row is written so a future `restore` re-applies the deletion
 *    instead of resurrecting the deleted account.
 */

export async function notifyAccountDeletion(userId: string, username: string): Promise<void> {
  const [link] = await db.select().from(telegramLinks).where(eq(telegramLinks.userId, userId)).limit(1);
  if (!link) return;
  const bot = await getPlatformBot();
  if (!bot.configured) return;
  await tg(bot.token, "sendMessage", {
    chat_id: link.chatId,
    text:
      `👋 <b>Your Panda Chat account has been deleted.</b>\n\n` +
      `The account @${username} and all of its rooms, messages and files were removed as requested. ` +
      `This Telegram chat is now disconnected.\n\n` +
      `Thank you for using Panda Chat 🐼`,
    parse_mode: "HTML",
  }).catch(() => undefined);
}

/**
 * Re-applies the deletion policy for tombstoned users after a restore:
 * deletes their account rows again and re-anonymizes their guest messages.
 * Called at the END of restoreFromBackup, when tombstones from BOTH the
 * current install and the archive exist.
 */
export async function applyDeletionTombstones(): Promise<{ reapplied: number }> {
  const tombstones = await db.execute<{ user_id: string; username: string }>(
    sql`select user_id, username from deleted_accounts`,
  );
  const rows = (tombstones.rows ?? []) as Array<{ user_id: string; username: string }>;
  if (rows.length === 0) return { reapplied: 0 };

  const ids = rows.map((r) => r.user_id);
  let reapplied = 0;

  for (const id of ids) {
    const [restored] = await db.select({ id: users.id }).from(users).where(eq(users.id, id)).limit(1);
    if (!restored) continue; // already absent from the archive too

    // Anonymize their guest messages in rooms they didn't own.
    const memberRooms = db
      .select({ id: roomMembers.id })
      .from(roomMembers)
      .innerJoin(rooms, eq(rooms.id, roomMembers.roomId))
      .where(eq(roomMembers.userId, id));
    await db
      .update(messages)
      .set({ authorName: "Deleted user" })
      .where(eq(messages.memberId, memberRooms));

    await db.delete(users).where(eq(users.id, id));
    reapplied += 1;
  }

  await audit("account.deletion_reapplied", { details: `count=${reapplied}` }).catch(() => undefined);
  return { reapplied };
}

/** Utility used by tests and the restore flow. */
export async function tombstonedUsernames(): Promise<string[]> {
  const rows = await db.execute<{ username: string }>(sql`select username from deleted_accounts`);
  return ((rows.rows ?? []) as Array<{ username: string }>).map((r) => r.username);
}
