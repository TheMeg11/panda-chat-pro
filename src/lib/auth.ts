import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sessions, userAvatars, users, type User } from "@/db/schema";
import { randomToken, sha256 } from "./crypto";
import { requestMeta } from "./request";

/**
 * Session model
 * -------------
 * The raw session token only ever lives inside an HttpOnly cookie; the database stores its sha256.
 *
 *  - Remember me ON  → cookie "p.<token>" with Max-Age (survives refreshes and browser restarts).
 *  - Remember me OFF → cookie "e.<token>" without Max-Age. `src/proxy.ts` revokes this kind of
 *    session on every full page load (refresh, new tab, typed URL), so refreshing signs the user out,
 *    while in-app (client-side) navigation keeps working.
 */
export const SESSION_COOKIE = "pc_session";
const PERSISTENT_DAYS = 30;
const EPHEMERAL_HOURS = 12;

export type CurrentUser = User & { sessionId: string; persistent: boolean; avatarVersion: number };

export function parseSessionCookie(value: string | undefined | null) {
  if (!value) return null;
  const match = /^([pe])\.([A-Za-z0-9_-]{32,128})$/.exec(value);
  if (!match) return null;
  return { persistent: match[1] === "p", raw: match[2] };
}

export async function createUserSession(userId: string, remember: boolean) {
  const raw = randomToken(32);
  const meta = await requestMeta();
  const expiresAt = new Date(Date.now() + (remember ? PERSISTENT_DAYS * 86_400_000 : EPHEMERAL_HOURS * 3_600_000));
  await db.insert(sessions).values({
    id: sha256(raw),
    userId,
    persistent: remember,
    expiresAt,
    userAgent: meta.userAgent,
    ip: meta.ip,
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, `${remember ? "p" : "e"}.${raw}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: meta.secure,
    path: "/",
    ...(remember ? { maxAge: PERSISTENT_DAYS * 86_400 } : {}),
  });
}

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const jar = await cookies();
  const parsed = parseSessionCookie(jar.get(SESSION_COOKIE)?.value);
  if (!parsed) return null;
  const id = sha256(parsed.raw);
  const rows = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.session.persistent !== parsed.persistent) return null;
  if (row.session.expiresAt.getTime() < Date.now()) return null;
  if (row.user.status !== "active") return null;
  if (Date.now() - row.session.lastSeenAt.getTime() > 5 * 60_000) {
    db.update(sessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(sessions.id, id))
      .catch(() => undefined);
  }
  // avatarVersion lets clients cache-bust /api/users/<id>/avatar without
  // ever shipping the bytes themselves (1 = avatar exists, 0 = none).
  let avatarVersion = 0;
  try {
    const [avatar] = await db
      .select({ userId: userAvatars.userId })
      .from(userAvatars)
      .where(eq(userAvatars.userId, row.user.id))
      .limit(1);
    avatarVersion = avatar ? 1 : 0;
  } catch {
    /* table not migrated yet */
  }
  return { ...row.user, sessionId: row.session.id, persistent: row.session.persistent, avatarVersion };
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function destroyCurrentSession() {
  const jar = await cookies();
  const parsed = parseSessionCookie(jar.get(SESSION_COOKIE)?.value);
  if (parsed) await db.delete(sessions).where(eq(sessions.id, sha256(parsed.raw)));
  jar.delete(SESSION_COOKIE);
}
