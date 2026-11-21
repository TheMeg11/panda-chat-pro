import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sessions, users } from "@/db/schema";
import { audit } from "./audit";
import type { RequestMeta } from "./request";

/**
 * New-device login detection & audit entry.
 *
 * Identity signal: a COARSE device fingerprint derived from the User-Agent
 * (OS family + browser family). IP is deliberately NOT part of the fingerprint
 * — mobile networks rotate IPs constantly and would cry wolf. A new IP on a
 * known device alone is normal; a new DEVICE is the event worth recording.
 *
 * When an unseen device signs in (and it is not the account's first login
 * ever) we write an audit entry the user can review under Account → Sessions.
 */

export function deviceFingerprint(userAgent: string | null): string {
  if (!userAgent) return "unknown";
  const ua = userAgent.toLowerCase();

  const os = /windows phone|windows/.test(ua)
    ? "Windows"
    : /iphone|ipad|ipod/.test(ua)
      ? "iOS"
      : /android/.test(ua)
        ? "Android"
        : /mac os x|macintosh/.test(ua)
          ? "macOS"
          : /cros/.test(ua)
            ? "ChromeOS"
            : /linux/.test(ua)
              ? "Linux"
              : "Other OS";

  const browser = /edg\//.test(ua)
    ? "Edge"
    : /firefox|fxios/.test(ua)
      ? "Firefox"
      : /samsungbrowser/.test(ua)
        ? "Samsung Internet"
        : /chrome|crios/.test(ua)
          ? "Chrome"
          : /safari/.test(ua)
            ? "Safari"
            : /panda|next\.js|node/.test(ua)
              ? "App"
              : "Other";

  return `${os} · ${browser}`;
}

/** Call BEFORE the new session row is inserted. */
export async function notifyLoginDevice(userId: string, meta: RequestMeta): Promise<void> {
  try {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) return;

    const known = await db
      .select({ userAgent: sessions.userAgent })
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .limit(100);

    const isFirstLoginEver = !user.lastLoginAt;
    if (isFirstLoginEver && known.length === 0) return; // brand-new account, no baseline yet

    const fingerprint = deviceFingerprint(meta.userAgent);
    const seenBefore = known.some((s) => deviceFingerprint(s.userAgent) === fingerprint);
    if (seenBefore) return;

    await audit("auth.new_device", {
      targetType: "user",
      targetId: userId,
      details: `device="${fingerprint}" ip=${meta.ip.slice(0, 45)}`,
    });
  } catch {
    /* the audit entry must never break login */
  }
}
