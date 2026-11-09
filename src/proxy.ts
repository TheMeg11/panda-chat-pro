import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { adminHost, adminLinkBase } from "@/lib/admin-host";

/**
 * Admin host routing.
 *
 * When ADMIN_HOST is configured, EVERY page request to that hostname is served
 * by the private super-admin panel: "/" shows the panel login, "/users" shows
 * the users page, and so on — without the secret ADMIN_PATH ever appearing in
 * the browser. The main site (dashboard, login, landing) is not reachable on
 * the admin host, and static assets (/_next/*, icons) are untouched.
 */
function rewriteAdminHost(req: NextRequest): NextResponse | null {
  const host = (req.headers.get("x-forwarded-host") || req.headers.get("host") || "").toLowerCase().split(":")[0];
  const configured = adminHost().split(":")[0];
  if (!configured || !host || host !== configured) return null;

  const panel = adminLinkBase();
  if (!panel) return null;
  const path = req.nextUrl.pathname;
  if (path === panel || path.startsWith(`${panel}/`)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = `${panel}${path === "/" ? "" : path}`;
  return NextResponse.rewrite(url);
}

/**
 * "Remember me" enforcement.
 *
 * Sessions created WITHOUT "Remember me" carry the cookie prefix "e." (ephemeral).
 * Such a session only lives for the current page lifetime: any full document load
 * (refresh, new tab, typed URL) revokes it server-side and clears the cookie, so the
 * user is signed out. Client-side navigations (RSC fetches), server actions and API
 * calls are not document loads and keep working.
 *
 * Remembered sessions ("p." prefix) are untouched and persist across refreshes and
 * browser restarts until they expire.
 */
const SESSION_COOKIE = "pc_session";

function isFullPageLoad(req: NextRequest): boolean {
  if (req.method !== "GET") return false;
  const h = req.headers;
  if (h.get("rsc") || h.get("next-router-prefetch") || h.get("next-router-state-tree") || h.get("next-action")) {
    return false;
  }
  if (req.nextUrl.searchParams.has("_rsc")) return false;
  const dest = h.get("sec-fetch-dest");
  if (dest) return dest === "document";
  const mode = h.get("sec-fetch-mode");
  if (mode) return mode === "navigate";
  return (h.get("accept") ?? "").includes("text/html");
}

export async function proxy(req: NextRequest) {
  const adminRewrite = rewriteAdminHost(req);
  if (adminRewrite) return adminRewrite;

  const value = req.cookies.get(SESSION_COOKIE)?.value;
  if (!value || !value.startsWith("e.") || !isFullPageLoad(req)) return NextResponse.next();

  try {
    const id = createHash("sha256").update(value.slice(2)).digest("hex");
    await db.delete(sessions).where(eq(sessions.id, id));
  } catch (error) {
    console.error("[panda-chat] failed to revoke ephemeral session", error);
  }

  // Render this request as signed-out and tell the browser to drop the cookie.
  const headers = new Headers(req.headers);
  const remaining = (req.headers.get("cookie") ?? "")
    .split(/;\s*/)
    .filter((part) => part && !part.startsWith(`${SESSION_COOKIE}=`));
  if (remaining.length) headers.set("cookie", remaining.join("; "));
  else headers.delete("cookie");

  const res = NextResponse.next({ request: { headers } });
  res.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|icon.svg|favicon.ico|robots.txt).*)"],
};
