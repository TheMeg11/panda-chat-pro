import { beforeAll, describe, expect, it } from "vitest";
import { clearRateLimit, rateLimit } from "@/lib/rate-limit";

describe("in-memory rate limiter", () => {
  beforeAll(() => {
    clearRateLimit("unit:test-key");
  });

  it("allows up to the limit inside a window", () => {
    for (let i = 0; i < 3; i++) expect(rateLimit("unit:test-key", 3, 60_000).ok).toBe(true);
  });

  it("blocks the (limit+1)-th request", () => {
    const result = rateLimit("unit:test-key", 3, 60_000);
    expect(result.ok).toBe(false);
    expect(result.retryAfter).toBeGreaterThan(0);
    expect(result.retryAfter).toBeLessThanOrEqual(60);
  });

  it("resets after the window passes", async () => {
    // 5 successive calls, each after the 2ms window already expired.
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setTimeout(resolve, 3));
      expect(rateLimit("unit:fast-key", 1, 2).ok).toBe(true);
    }
  });

  it("counts keys independently", () => {
    clearRateLimit("unit:a");
    clearRateLimit("unit:b");
    expect(rateLimit("unit:a", 1, 60_000).ok).toBe(true);
    expect(rateLimit("unit:b", 1, 60_000).ok).toBe(true); // not affected by a
    expect(rateLimit("unit:a", 1, 60_000).ok).toBe(false);
  });

  it("clearRateLimit resets a key", () => {
    clearRateLimit("unit:c");
    expect(rateLimit("unit:c", 1, 60_000).ok).toBe(true);
    expect(rateLimit("unit:c", 1, 60_000).ok).toBe(false);
    clearRateLimit("unit:c");
    expect(rateLimit("unit:c", 1, 60_000).ok).toBe(true);
  });
});
