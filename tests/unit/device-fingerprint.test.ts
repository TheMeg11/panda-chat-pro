import { describe, expect, it } from "vitest";
import { deviceFingerprint } from "@/lib/login-notify";

describe("new-device detection (§4.6)", () => {
  it("folds a full UA into a coarse OS · Browser fingerprint", () => {
    expect(deviceFingerprint("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0 Safari/537.36")).toBe("Windows · Chrome");
    expect(deviceFingerprint("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1")).toBe("iOS · Safari");
    expect(deviceFingerprint("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/125.0 Mobile Safari/537.36")).toBe("Android · Chrome");
    expect(deviceFingerprint("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15")).toBe("macOS · Safari");
    expect(deviceFingerprint("Mozilla/5.0 (X11; Linux x86_64; rv:126.0) Gecko/20100101 Firefox/126.0")).toBe("Linux · Firefox");
  });

  it("treats missing UA as unknown", () => {
    expect(deviceFingerprint(null)).toBe("unknown");
    expect(deviceFingerprint("")).toBe("unknown");
  });

  it("ignores UA version noise (same device across updates)", () => {
    const v124 = deviceFingerprint("Mozilla/5.0 (Windows NT 10.0) Chrome/124.0 Safari/537.36");
    const v125 = deviceFingerprint("Mozilla/5.0 (Windows NT 10.0) Chrome/125.0 Safari/537.36");
    expect(v124).toBe(v125);
  });
});
