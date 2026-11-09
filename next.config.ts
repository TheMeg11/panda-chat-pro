import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === "production";
/**
 * Set CSP_REPORT_ONLY=1 to ship the tightened policy in Report-Only mode first
 * (§4.9): browsers report violations without breaking anything, the admin fixes
 * the causes, then the flag is removed and the policy is enforced.
 */
const cspReportOnly = process.env.CSP_REPORT_ONLY === "1";

/**
 * Content-Security-Policy:
 * - everything is served same-origin (self-hosted fonts, self-hosted assets)
 * - Next.js needs 'unsafe-inline' for its bootstrap/hydration scripts (no external script is ever loaded)
 * - 'unsafe-eval' is only enabled outside production for the dev overlay
 * - frame-ancestors 'none' + X-Frame-Options stop clickjacking of rooms and the admin console
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Invitation tokens live in URLs — never leak them to other sites through the Referer header.
  { key: "Referrer-Policy", value: "same-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "X-Frame-Options", value: "DENY" },
  // §4.9: conversational surfaces must never end up in a search engine cache.
  { key: "X-Robots-Tag", value: "noindex, nofollow" },
  // Cross-origin isolation hardening (defence-in-depth against Spectre-style leaks).
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  // The app is always served over HTTPS by the platform edge.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  cspReportOnly
    ? { key: "Content-Security-Policy-Report-Only", value: csp }
    : { key: "Content-Security-Policy", value: csp },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      // Chat APIs and auth pages are never cached by any intermediary (§4.4/§4.11).
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }] },
    ];
  },
};

export default nextConfig;
