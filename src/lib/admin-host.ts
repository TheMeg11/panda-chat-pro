/**
 * Admin host support.
 *
 * When ADMIN_HOST is set (e.g. "adm.chat.kanar.ir"), the whole panel is also
 * reachable at that dedicated hostname: every page request is rewritten to the
 * private ADMIN_PATH panel server-side, so links stay clean ("/users") and the
 * secret path never appears in the URL bar. The main site is NOT reachable on
 * the admin host — only the panel.
 *
 * This module is intentionally free of next/headers imports so both the proxy
 * (middleware) and server components can use it.
 */

export function adminHost(): string {
  return (process.env.ADMIN_HOST || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
}

/** Normalises "Host: adm.example.com:443" → "adm.example.com" for comparison. */
function bareHost(host: string | null | undefined): string {
  return (host || "").trim().toLowerCase().split(":")[0];
}

export function isHostAdmin(host: string | null | undefined): boolean {
  const configured = adminHost();
  if (!configured) return false;
  const candidate = bareHost(host);
  return Boolean(candidate) && candidate === bareHost(configured);
}

/** The base for admin links: "" on the dedicated admin host, "/{ADMIN_PATH}" otherwise. */
export function adminLinkBase(): string {
  const path = (process.env.ADMIN_PATH || "").trim().replace(/^\/+|\/+$/g, "");
  return path ? `/${path}` : "";
}
