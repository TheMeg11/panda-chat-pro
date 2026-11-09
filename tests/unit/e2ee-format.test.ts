import { describe, expect, it } from "vitest";
import {
  buildFileMetadata,
  isEnvelope,
  parseEnvelope,
} from "@/lib/e2ee-client";

/**
 * E2EE envelope format contract (the parts testable without WebCrypto):
 * format `e2ee.v1.<iv-b64url>.<ct-b64url>`.
 */
describe("E2EE envelope format", () => {
  it("recognizes valid envelopes", () => {
    expect(isEnvelope("e2ee.v1.AAAA.BBBB")).toBe(true);
    expect(isEnvelope("e2ee.v2.AAAA.BBBB")).toBe(false); // future version ≠ v1
    expect(isEnvelope("hello world")).toBe(false);
    expect(isEnvelope("")).toBe(false);
    expect(isEnvelope("e2ee.v1.only-two-parts")).toBe(false);
  });

  it("parses iv and ciphertext", () => {
    const env = parseEnvelope("e2ee.v1.SXZ2.Q3R4");
    expect(env).toEqual({ v: 1, iv: "SXZ2", ct: "Q3R4" });
  });

  it("returns null for malformed envelopes", () => {
    expect(parseEnvelope("junk")).toBeNull();
    expect(parseEnvelope("e2ee.v1.x")).toBeNull();
  });

  it("embeds file metadata as JSON with the per-file IV", () => {
    const meta = buildFileMetadata("photo.jpg", "image/jpeg", "SUNWQQ");
    const parsed = JSON.parse(meta) as { __file: { name: string; mime: string; iv: string } };
    expect(parsed.__file.name).toBe("photo.jpg");
    expect(parsed.__file.mime).toBe("image/jpeg");
    expect(parsed.__file.iv).toBe("SUNWQQ");
  });

  it("clamps long filenames in metadata", () => {
    const meta = buildFileMetadata("x".repeat(500), "image/png", "IV");
    const parsed = JSON.parse(meta) as { __file: { name: string } };
    expect(parsed.__file.name.length).toBeLessThanOrEqual(190);
  });
});

describe("self-destruct TTL contract (§4.2)", () => {
  it("offers exactly off / 1h / 24h / 7d", async () => {
    const { getConfig, resetConfigCache } = await import("@/lib/config");
    resetConfigCache();
    expect(getConfig().selfDestructOptions).toEqual([3600, 86_400, 7 * 86_400]);
  });
});
