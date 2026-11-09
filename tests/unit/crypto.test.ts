import { describe, expect, it } from "vitest";
import {
  encryptSecret,
  decryptSecret,
  hashPassword,
  verifyPassword,
  safeEqual,
  randomToken,
  sha256,
} from "@/lib/crypto";

describe("safeEqual (audit finding — verified FALSE POSITIVE)", () => {
  it("compares equal strings of any length without throwing", () => {
    expect(safeEqual("a".repeat(10_000), "a".repeat(10_000))).toBe(true);
    expect(safeEqual("short", "short")).toBe(true);
  });

  it("compares different-length strings safely (SHA-256 normalizes length)", () => {
    // The audit claimed timingSafeEqual throws on length mismatch — both inputs
    // are hashed first, so it never does.
    expect(() => safeEqual("abc", "abcdefgh")).not.toThrow();
    expect(safeEqual("abc", "abcdefgh")).toBe(false);
  });

  it("rejects different strings", () => {
    expect(safeEqual("secret-1", "secret-2")).toBe(false);
  });

  it("defends non-string input", () => {
    expect(safeEqual(null as unknown as string, "x")).toBe(false);
    expect(safeEqual(undefined as unknown as string, undefined as unknown as string)).toBe(false);
  });
});

describe("secret encryption at rest (AES-256-GCM)", () => {
  it("round-trips a bot token", () => {
    const token = "1234567890:AAEfakeTestTokenNotARealSecretAABBCCDDEE";
    const enc = encryptSecret(token);
    expect(enc).toMatch(/^v1\./);
    expect(enc).not.toContain(token);
    expect(decryptSecret(enc)).toBe(token);
  });

  it("produces different ciphertexts for the same plaintext (random IV)", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  it("rejects tampered payloads (GCM auth tag)", () => {
    const enc = encryptSecret("bot-token");
    const parts = enc.split(".");
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("A") ? "B" : "A");
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });

  it("rejects malformed payloads", () => {
    expect(() => decryptSecret("garbage")).toThrow();
    expect(() => decryptSecret("v2.a.b.c")).toThrow();
  });
});

describe("password hashing (scrypt)", () => {
  it("hashes and verifies", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).toMatch(/^scrypt\$/);
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("rejects corrupted stored hashes", async () => {
    expect(await verifyPassword("x", null)).toBe(false);
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
    expect(await verifyPassword("x", "scrypt$1$2$3")).toBe(false);
  });

  it("dummy verification burns CPU and always fails", async () => {
    expect(await verifyDummyPasswordSafe("whatever")).toBe(false);
  });
});

async function verifyDummyPasswordSafe(password: string): Promise<boolean> {
  const { verifyDummyPassword } = await import("@/lib/crypto");
  return verifyDummyPassword(password);
}

describe("tokens & hashes", () => {
  it("randomToken is URL-safe and unique", () => {
    const a = randomToken(32);
    const b = randomToken(32);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it("sha256 is deterministic and hex", () => {
    expect(sha256("panda")).toBe(sha256("panda"));
    expect(sha256("panda")).toMatch(/^[a-f0-9]{64}$/);
  });
});
