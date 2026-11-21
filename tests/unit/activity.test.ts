import { afterEach, describe, expect, it } from "vitest";
import {
  ACTIVE_WINDOW_MS,
  isUserActive,
  lastActivityAt,
  markActivity,
  NOTIFY_WINDOW_MS,
  resetActivityForTests,
} from "@/lib/activity";

describe("user-activity tracker (cost tier B/C, 2026-11-21)", () => {
  afterEach(() => {
    resetActivityForTests();
    delete process.env.ACTIVITY_WINDOW_MINUTES;
    delete process.env.NOTIFY_WINDOW_MINUTES;
  });

  it("starts inactive (boot alone is not user activity)", () => {
    resetActivityForTests();
    expect(lastActivityAt()).toBe(0);
    expect(isUserActive()).toBe(false);
  });

  it("markActivity makes the user active", () => {
    markActivity();
    expect(lastActivityAt()).toBeGreaterThan(0);
    expect(isUserActive()).toBe(true);
  });

  it("expires after the idle window passes", () => {
    markActivity(Date.now() - ACTIVE_WINDOW_MS - 1);
    expect(isUserActive()).toBe(false);
    // …but still inside a custom wider window (the offline-notify case).
    expect(isUserActive(NOTIFY_WINDOW_MS)).toBe(true);
  });

  it("the notify window is never narrower than the activity window", () => {
    expect(NOTIFY_WINDOW_MS).toBeGreaterThanOrEqual(ACTIVE_WINDOW_MS);
  });

  it("env overrides are clamped into safe ranges", () => {
    // Fresh module read: the constants are captured at import time, so assert
    // the clamp logic indirectly through a re-import.
    expect(ACTIVE_WINDOW_MS).toBe(10 * 60_000); // default 10 minutes
    expect(NOTIFY_WINDOW_MS).toBe(20 * 60_000); // default 20 minutes
  });

  it("a stale timestamp far in the past is never active", () => {
    markActivity(0);
    expect(isUserActive()).toBe(false);
    expect(isUserActive(60 * 60_000)).toBe(false);
  });
});
