import { cache } from "react";
import { cookies, headers } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adminSessions } from "@/db/schema";
import { randomToken, safeEqual, sha256, verifyPassword } from "./crypto";
import { adminLinkBase, isHostAdmin } from "./admin-host";
import { requestMeta } from "./request";

/**
 * Super Admin configuration comes exclusively from environment variables:
 *   ADMIN_PATH            private URL segment, e.g. "control-7f3a9c2e" → https://host/control-7f3a9c2e
 *   ADMIN_USERNAME        administrator username
 *   ADMIN_PASSWORD        administrator password (or ADMIN_PASSWORD_HASH with a scrypt hash)
 * If any of these are missing the admin panel is disabled and its URL returns 404.
 */
export const ADMIN_COOKIE = "pc_admin";
const ADMIN_SESSION_HOURS = 8;

export function getAdminConfig() {
  const path = (process.env.ADMIN_PATH || "").trim().replace(/^\/+|\/+$/g, "");
  const username = (process.env.ADMIN_USERNAME || "").trim();
  const password = process.env.ADMIN_PASSWORD || "";
  const passwordHash = process.env.ADMIN_PASSWORD_HASH || "";
  const validPath = /^[A-Za-z0-9_-]{6,128}$/.test(path);
  return {
    path,
    username,
    password,
    passwordHash,
    enabled: Boolean(validPath && username && (password || passwordHash)),
  };
}

export function isAdminSlug(slug: string): boolean {
  const config = getAdminConfig();
  return config.enabled && safeEqual(decodeURIComponent(slug), config.path);
}

export async function verifyAdminCredentials(username: string, password: string): Promise<boolean> {
  const config = getAdminConfig();
  if (!config.enabled) return false;
  const userOk = safeEqual(username, config.username);
  const passOk = config.passwordHash
    ? await verifyPassword(password, config.passwordHash)
    : safeEqual(password, config.password);
  return userOk && passOk;
}

export async function createAdminSession() {
  const raw = randomToken(32);
  const meta = await requestMeta();
  await db.insert(adminSessions).values({
    id: sha256(raw),
    expiresAt: new Date(Date.now() + ADMIN_SESSION_HOURS * 3_600_000),
    userAgent: meta.userAgent,
    ip: meta.ip,
  });
  (await cookies()).set(ADMIN_COOKIE, raw, {
    httpOnly: true,
    sameSite: "strict",
    secure: meta.secure,
    path: "/",
    maxAge: ADMIN_SESSION_HOURS * 3600,
  });
}

export const getAdminSession = cache(async () => {
  if (!getAdminConfig().enabled) return null;
  const raw = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!raw || !/^[A-Za-z0-9_-]{32,128}$/.test(raw)) return null;
  const [row] = await db.select().from(adminSessions).where(eq(adminSessions.id, sha256(raw))).limit(1);
  if (!row || row.expiresAt.getTime() < Date.now()) return null;
  return row;
});

export async function destroyAdminSession() {
  const jar = await cookies();
  const raw = jar.get(ADMIN_COOKIE)?.value;
  if (raw) await db.delete(adminSessions).where(eq(adminSessions.id, sha256(raw)));
  jar.delete(ADMIN_COOKIE);
}

/**
 * Base URL for panel links: "" when the request arrives on the dedicated admin
 * host (ADMIN_HOST), "/{ADMIN_PATH}" when reached through the main site.
 */
export const getAdminBase = cache(async (): Promise<string> => {
  const h = await headers();
  if (isHostAdmin(h.get("x-forwarded-host") || h.get("host"))) return "";
  return adminLinkBase();
});
