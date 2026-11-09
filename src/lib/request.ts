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

/** Basic CSRF defence for JSON route handlers: browsers always send Origin on POST/DELETE. */
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const host = trusted(req.headers.get("x-forwarded-host")) || req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
