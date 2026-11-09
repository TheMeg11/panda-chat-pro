import { describe, expect, it } from "vitest";
import { isSameOrigin } from "@/lib/request";

/** Minimal Request stub with the headers isSameOrigin reads. */
function req(headers: Record<string, string>): Request {
  return { headers: { get: (name: string) => headers[name.toLowerCase()] ?? null } } as unknown as Request;
}

describe("isSameOrigin / CSRF (§3.5 hardening)", () => {
  const host = { host: "chat.example.com" };

  it("accepts a same-origin POST with matching Origin", () => {
    expect(isSameOrigin(req({ ...host, origin: "https://chat.example.com" }))).toBe(true);
  });

  it("accepts missing Origin from non-browser clients (webhooks, curl)", () => {
    expect(isSameOrigin(req(host))).toBe(true);
  });

  it("rejects cross-site Origin", () => {
    expect(isSameOrigin(req({ ...host, origin: "https://evil.example.net" }))).toBe(false);
  });

  it("rejects the opaque origin 'null' (sandboxed iframe / data URL)", () => {
    expect(isSameOrigin(req({ ...host, origin: "null" }))).toBe(false);
  });

  it("rejects same-site subdomain spoofing", () => {
    expect(isSameOrigin(req({ ...host, origin: "https://chat.example.com.evil.io" }))).toBe(false);
  });

  it("honours sec-fetch-site: cross-site (modern browsers) even without Origin", () => {
    expect(isSameOrigin(req({ ...host, "sec-fetch-site": "cross-site" }))).toBe(false);
  });

  it("accepts sec-fetch-site: same-origin", () => {
    expect(isSameOrigin(req({ ...host, "sec-fetch-site": "same-origin" }))).toBe(true);
  });

  it("accepts sec-fetch-site: none (typed URL / bookmark)", () => {
    expect(isSameOrigin(req({ ...host, "sec-fetch-site": "none" }))).toBe(true);
  });

  it("uses the trusted x-forwarded-host (Railway edge) for comparison", () => {
    expect(
      isSameOrigin(
        req({
          host: "internal.railway.internal:3000",
          "x-forwarded-host": "chat.example.com",
          origin: "https://chat.example.com",
        }),
      ),
    ).toBe(true);
  });

  it("takes the LAST x-forwarded-host entry (anti IP/host spoofing)", () => {
    expect(
      isSameOrigin(
        req({
          host: "chat.example.com",
          "x-forwarded-host": "evil.io, chat.example.com",
          origin: "https://chat.example.com",
        }),
      ),
    ).toBe(true);
    expect(
      isSameOrigin(
        req({
          host: "chat.example.com",
          "x-forwarded-host": "chat.example.com, evil.io",
          origin: "https://evil.io",
        }),
      ),
      // the trusted (right-most) forwarded host is evil.io → origin matches it → allowed host pair,
      // but Host itself disagrees; still same origin pair per proxy contract.
    ).toBe(true);
  });

  it("tolerates default ports in Origin vs Host", () => {
    expect(isSameOrigin(req({ host: "chat.example.com", origin: "https://chat.example.com:443" }))).toBe(true);
    expect(isSameOrigin(req({ host: "chat.example.com:443", origin: "https://chat.example.com" }))).toBe(true);
    expect(isSameOrigin(req({ host: "chat.example.com", origin: "http://chat.example.com:80" }))).toBe(true);
    // A non-default port mismatch is still rejected.
    expect(isSameOrigin(req({ host: "chat.example.com:8080", origin: "https://chat.example.com" }))).toBe(false);
  });
});
