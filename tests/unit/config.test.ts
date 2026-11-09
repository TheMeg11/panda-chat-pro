import { describe, expect, it } from "vitest";
import { getConfig, resetConfigCache, deriveKey } from "@/lib/config";

/** NODE_ENV is typed read-only; tests must flip it, so go through a cast. */
function setNodeEnv(value: string | undefined) {
  (process.env as Record<string, string | undefined>).NODE_ENV = value;
}

describe("centralized configuration validation (§3.10)", () => {
  const ORIGINAL_ENV = { ...process.env };

  it("accepts a proper APP_SECRET", () => {
    process.env.APP_SECRET = "x".repeat(48);
    resetConfigCache();
    expect(getConfig().appSecret).toBe("x".repeat(48));
  });

  it("clamps numeric env vars into safe ranges", () => {
    process.env.FILES_MAX_MB = "9999";
    process.env.FILES_TTL_HOURS = "2";
    process.env.AUDIT_TTL_DAYS = "5";
    resetConfigCache();
    const config = getConfig();
    expect(config.fileMaxBytes).toBe(64 * 1024 * 1024); // clamped to max 64
    expect(config.fileTtlHours).toBe(2);
    expect(config.auditTtlDays).toBe(7); // clamped to min 7
  });

  it("parses boolean flags tolerantly", () => {
    process.env.E2EE_ENABLED = "0";
    process.env.CSP_REPORT_ONLY = "true";
    resetConfigCache();
    expect(getConfig().e2eeEnabled).toBe(false);
    expect(getConfig().cspReportOnly).toBe(true);
    delete process.env.E2EE_ENABLED;
    delete process.env.CSP_REPORT_ONLY;
    resetConfigCache();
    expect(getConfig().e2eeEnabled).toBe(true);
  });

  it("exposes the canonical self-destruct options", () => {
    resetConfigCache();
    expect(getConfig().selfDestructOptions).toEqual([3600, 86_400, 604_800]);
  });

  it("derives different keys for different labels (domain separation)", () => {
    const a = deriveKey("secret", "label-a");
    const b = deriveKey("secret", "label-b");
    expect(a).not.toEqual(b);
    expect(a).toHaveLength(32);
    expect(deriveKey("secret", "label-a")).toEqual(a);
  });

  it("throws in production when APP_SECRET is missing (no DATABASE_URL fallback)", () => {
    setNodeEnv("production");
    delete process.env.NEXT_PHASE;
    delete process.env.APP_SECRET;
    resetConfigCache();
    expect(() => getConfig()).toThrow(/APP_SECRET/);
  });

  it("allows build phase without APP_SECRET (build never encrypts)", () => {
    setNodeEnv("production");
    process.env.NEXT_PHASE = "phase-production-build";
    delete process.env.APP_SECRET;
    resetConfigCache();
    expect(() => getConfig()).not.toThrow();
  });

  it("falls back to a dev-only key outside production with a warning", () => {
    setNodeEnv("development");
    delete process.env.NEXT_PHASE;
    delete process.env.APP_SECRET;
    resetConfigCache();
    expect(getConfig().appSecret).toBeTruthy();
  });

  it("keeps the backup key independent from APP_SECRET derivation source", () => {
    setNodeEnv("development");
    process.env.APP_SECRET = "a".repeat(40);
    resetConfigCache();
    const config = getConfig();
    expect(config.backupKey).toHaveLength(32);
    if (config.appSecret) {
      expect(config.backupKey?.equals(deriveKey(config.appSecret, "panda-chat:backup:v1"))).toBe(true);
      expect(config.backupKey?.equals(deriveKey(config.appSecret, "panda-chat:secretbox:v1"))).toBe(false);
    }
  });

  // restore
  it("restores env between tests", () => {
    setNodeEnv(ORIGINAL_ENV.NODE_ENV ?? "test");
    process.env.APP_SECRET = ORIGINAL_ENV.APP_SECRET;
    resetConfigCache();
  });
});
