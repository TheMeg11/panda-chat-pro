import { describe, expect, it } from "vitest";
import { isBackupDue, tehranHourMinute } from "@/lib/backup";

/**
 * First-wake backup scheduling (cost tier C, 2026-11-21).
 *
 * Tehran is UTC+03:30 — every fixture below is built from a UTC instant and
 * its expected Tehran wall-clock is spelled out, so the math stays auditable.
 */

// UTC instants on 2026-11-20/21 → Tehran (UTC+3:30):
const utc = (y: number, mo: number, d: number, h: number, mi: number) => new Date(Date.UTC(y, mo - 1, d, h, mi));

describe("backup scheduling (cost tier C, 2026-11-21)", () => {
  it("maps UTC instants to Tehran wall-clock", () => {
    // 2026-11-20 23:30 UTC → 2026-11-21 03:00 Tehran
    expect(tehranHourMinute(utc(2026, 11, 20, 23, 30))).toEqual({ hour: 3, minute: 0 });
    // 2026-11-21 00:00 UTC → 03:30 Tehran
    expect(tehranHourMinute(utc(2026, 11, 21, 0, 0))).toEqual({ hour: 3, minute: 30 });
    // 2026-11-21 10:30 UTC → 14:00 Tehran
    expect(tehranHourMinute(utc(2026, 11, 21, 10, 30))).toEqual({ hour: 14, minute: 0 });
  });

  it("is NOT due before the scheduled hour (03:00 Tehran, hour=3)", () => {
    // 2026-11-20 23:05 UTC → 02:35 Tehran
    expect(isBackupDue(3, utc(2026, 11, 20, 23, 5))).toBe(false);
  });

  it("is NOT due inside the 10-minute grace window (03:00–03:09 Tehran)", () => {
    // 2026-11-20 23:30 UTC → 03:00 Tehran — on-time ticker still owns this slot
    expect(isBackupDue(3, utc(2026, 11, 20, 23, 30))).toBe(false);
    // 2026-11-20 23:39 UTC → 03:09 Tehran
    expect(isBackupDue(3, utc(2026, 11, 20, 23, 39))).toBe(false);
  });

  it("is due 10 minutes into the scheduled hour (03:10 Tehran)", () => {
    // 2026-11-20 23:40 UTC → 03:10 Tehran — catch-up territory
    expect(isBackupDue(3, utc(2026, 11, 20, 23, 40))).toBe(true);
  });

  it("stays due for the rest of the day (late wake at 14:00 Tehran)", () => {
    // 2026-11-21 10:30 UTC → 14:00 Tehran
    expect(isBackupDue(3, utc(2026, 11, 21, 10, 30))).toBe(true);
  });

  it("is due again just after midnight Tehran for the next day's schedule", () => {
    // 2026-11-21 20:40 UTC → 2026-11-22 00:10 Tehran — hour 0 passed hour 0's grace
    expect(isBackupDue(0, utc(2026, 11, 21, 20, 40))).toBe(true);
    // 2026-11-21 20:30 UTC → 00:00 Tehran — still inside the grace window
    expect(isBackupDue(0, utc(2026, 11, 21, 20, 30))).toBe(false);
  });

  it("handles the 23:xx scheduled hour (latest possible)", () => {
    // 2026-11-21 19:40 UTC → 23:10 Tehran
    expect(isBackupDue(23, utc(2026, 11, 21, 19, 40))).toBe(true);
    // 2026-11-21 19:35 UTC → 23:05 Tehran
    expect(isBackupDue(23, utc(2026, 11, 21, 19, 35))).toBe(false);
    // 2026-11-21 20:40 UTC → 2026-11-22 00:10 Tehran — hour rolled over, no longer due today
    expect(isBackupDue(23, utc(2026, 11, 21, 20, 40))).toBe(false);
  });
});
