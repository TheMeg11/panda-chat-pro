import { headers } from "next/headers";
import { getSettings } from "./settings";

type HeaderReader = { get(name: string): string | null };

export type RequestMeta = {
  ip: string;
  userAgent: string | null;
  secure: boolean;
  host: string;
  origin: string;
};

/**
 * Uses the LAST entry of a comma-separated proxy header.
 *
 * Forwarding proxies append the previous hop, so the right-most value is the one
 * added by the trusted edge (Railway). Taking the first value would let any client
 * spoof its IP ("X-Forwarded-For: 1.2.3.4, real-ip") and bypass IP-based rate limits
 * or poison audit logs.
 */
function trusted(value: string | null): string {
  if (!value) return "";
  const parts = value.split(",").map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : "";
}

export function metaFromHeaders(h: HeaderReader): RequestMeta {
  const host = trusted(h.get("x-forwarded-host")) || h.get("host") || "localhost:3000";
  const proto = trusted(h.get("x-forwarded-proto")) || "http";
  const ip = trusted(h.get("x-forwarded-for")) || h.get("x-real-ip") || "unknown";
  const ua = h.get("user-agent");
  return {
    ip: ip.slice(0, 64),
    userAgent: ua ? ua.slice(0, 250) : null,
    secure: proto === "https",
    host,
    origin: `${proto}://${host}`,
  };
}

export async function requestMeta(): Promise<RequestMeta> {
  return metaFromHeaders(await headers());
}

/** Public base URL used for invitation links. */
export async function getBaseUrl(): Promise<string> {
  const settings = await getSettings();
  const configured = settings.publicUrl || process.env.APP_URL || "";
  if (configured) return configured.replace(/\/+$/, "");
  return (await requestMeta()).origin;
}

/**
 * CSRF defence for JSON route handlers.
 *
 * Layers (hardened 2026):
 *  1. `Sec-Fetch-Site` (modern browsers): anything other than "same-origin"
 *     (or "none" for typed URLs / bookmarks) is rejected outright.
 *  2. `Origin` header: must be present for browser POST/DELETE/PUT and must
 *     match the Host / X-Forwarded-Host exactly (scheme-agnostic host:port).
 *  3. Missing Origin is only tolerated when Sec-Fetch-Site is absent or
 *     explicitly "none" — a plain cross-site request without Origin cannot
 *     carry ambient cookies in practice.
 * Non-browser clients (Telegram webhooks, curl) never send Sec-Fetch-Site and
 * are authenticated by their own secrets instead.
 */
export function isSameOrigin(req: Request): boolean {
  const fetchSite = req.headers.get("sec-fetch-site");
  if (fetchSite) {
    if (fetchSite === "same-origin" || fetchSite === "none") {
      // Same-origin or an explicit top-level navigation: also check Origin when present.
      const origin = req.headers.get("origin");
      if (!origin) return true;
      return originMatchesHost(origin, req);
    }
    return false; // cross-site, same-origin-cross-site — reject
  }

  const origin = req.headers.get("origin");
  if (!origin) return true; // legacy browser or non-browser client
  if (origin === "null") return false; // opaque origin (sandboxed iframe / data URL)
  return originMatchesHost(origin, req);
}

function originMatchesHost(origin: string, req: Request): boolean {
  const host = trusted(req.headers.get("x-forwarded-host")) || req.headers.get("host");
  if (!host) return false;
  try {
    const originUrl = new URL(origin);
    const originHost = originUrl.host.toLowerCase();
    const reqHost = host.toLowerCase();
    if (originHost === reqHost) return true;
    // Proxies sometimes forward the host without the port while the origin keeps
    // the default port (https://x.com vs x.com:443). Compare default-port-free.
    return stripDefaultPort(originHost, originUrl.protocol) === stripDefaultPort(reqHost, originUrl.protocol);
  } catch {
    return false;
  }
}

function stripDefaultPort(host: string, protocol: string): string {
  const [hostname, port] = host.split(":");
  if (!port) return hostname;
  const isDefault = (protocol === "https:" && port === "443") || (protocol !== "https:" && port === "80");
  return isDefault ? hostname : host;
}
