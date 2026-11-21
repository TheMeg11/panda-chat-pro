import { afterEach, describe, expect, it } from "vitest";
import {
  ACTIVE_WINDOW_MS,
  isUserActive,
  lastActivityAt,
  markActivity,
  resetActivityForTests,
} from "@/lib/activity";

describe("user-activity tracker (cost tier B/C, 2026-11-21)", () => {
  afterEach(() => {
    resetActivityForTests();
    delete process.env.ACTIVITY_WINDOW_MINUTES;
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
    // …but still inside a custom wider window.
    expect(isUserActive(30 * 60_000)).toBe(true);
  });

  it("env overrides are clamped into safe ranges", () => {
    expect(ACTIVE_WINDOW_MS).toBe(10 * 60_000); // default 10 minutes
  });

  it("a stale timestamp far in the past is never active", () => {
    markActivity(0);
    expect(isUserActive()).toBe(false);
    expect(isUserActive(60 * 60_000)).toBe(false);
  });
});
