import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { roomMembers } from "@/db/schema";
import { getSettings } from "../settings";
import { getPlatformBot, tg } from "./platform";

/**
 * Offline notifications — a gentle DIGEST, separate from per-message forwarding.
 *
 * For every linked user with offline_notify ON (and forwarding still enabled),
 * find their rooms that are NOT E2EE where someone ELSE wrote a message while
 * the user was away, and the newest such message is already 15+ minutes old
 * AND newer than the last time we pinged that (user, room). One Telegram
 * message per room is sent, then the membership's tg_notified_at stamp moves
 * forward — that stamp is the dedupe key, which makes the whole sweep
 * idempotent and safe to re-run every 5 minutes.
 *
 * Resilience: settings/bot problems abort the sweep quietly; per-room failures
 * are logged and never abort the loop (the stamp only advances on success, so
 * a failed room is retried on the next pass).
 */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** How many rooms one sweep may ping (a belt-and-braces cap against stampedes). */
const MAX_CANDIDATES = 50;

type CandidateRow = {
  member_id: string;
  user_id: string;
  room_id: string;
  room_name: string;
  chat_id: string;
  muted_rooms: string[] | null;
};

export async function sweepOfflineNotifications(): Promise<number> {
  try {
    const settings = await getSettings();
    if (!settings.telegramEnabled) return 0;
    const bot = await getPlatformBot();
    if (!bot.configured) return 0;

    // ONE query finds every (user, room) that currently qualifies:
    //  - link: offline_notify AND forward_enabled, user active + telegram allowed
    //  - room: not E2EE, not disabled
    //  - latest OTHER-sender message (not deleted, not self-destructed, not
    //    system) is 15+ minutes old and newer than the last notify stamp
    //  - user presence: the newest session heartbeat is OLDER than that message
    //    (no sessions at all counts as offline)
    const rows = await db.execute(sql`
      select rm.id as member_id,
             rm.user_id,
             rm.room_id,
             r.name as room_name,
             tl.chat_id,
             tl.muted_rooms
      from room_members rm
      join rooms r on r.id = rm.room_id
      join telegram_links tl on tl.user_id = rm.user_id
      join users u on u.id = rm.user_id
      cross join lateral (
        select max(m.created_at) as latest_at
        from messages m
        where m.room_id = rm.room_id
          and m.deleted_at is null
          and m.author_role <> 'system'
          and m.member_id is distinct from rm.id
          and (m.expires_at is null or m.expires_at > now())
          and m.created_at <= now() - interval '15 minutes'
          and m.created_at > coalesce(rm.tg_notified_at, '-infinity'::timestamptz)
      ) latest
      cross join lateral (
        select coalesce(max(s.last_seen_at), '-infinity'::timestamptz) as last_seen
        from sessions s
        where s.user_id = rm.user_id
      ) presence
      where tl.offline_notify = true
        and tl.forward_enabled = true
        and u.status = 'active'
        and u.can_use_telegram = true
        and r.e2ee_enabled = false
        and r.is_disabled = false
        and latest.latest_at is not null
        and presence.last_seen < latest.latest_at
      limit ${MAX_CANDIDATES}`);
    const candidates = rows.rows as unknown as CandidateRow[];

    const baseUrl = (settings.publicUrl || process.env.APP_URL || "").replace(/\/+$/, "");
    let sent = 0;
    for (const c of candidates) {
      try {
        // Muted rooms are excluded exactly like forwardMessageToTelegram does.
        if (Array.isArray(c.muted_rooms) && c.muted_rooms.includes(c.room_id)) continue;
        const link = baseUrl ? `\n${baseUrl}/dashboard` : "";
        await tg(bot.token, "sendMessage", {
          chat_id: c.chat_id,
          text: `🔔 شما پیام(های) جدید در «${esc(c.room_name)}» دارید — برای مشاهده وارد پاندا چت شوید.${link}`,
          parse_mode: "HTML",
          disable_notification: true,
          link_preview_options: { is_disabled: true },
        });
        // Dedupe stamp: only advances after a successful send.
        await db.update(roomMembers).set({ tgNotifiedAt: new Date() }).where(eq(roomMembers.id, c.member_id));
        sent += 1;
      } catch (error) {
        console.error("[panda-chat] offline notify failed", error);
      }
    }
    return sent;
  } catch (error) {
    console.error("[panda-chat] offline notify sweep failed", error);
    return 0;
  }
}
