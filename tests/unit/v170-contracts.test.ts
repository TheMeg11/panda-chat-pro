import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MIGRATIONS } from "../../scripts/db-migrate.mjs";
import { HOLD_TO_HIDE_MS } from "../../src/components/privacy";
import { APP_VERSION } from "../../src/lib/version";

/**
 * v1.6.0 contracts — the sync / notification / bot-from-site release.
 * These pin the pieces that a regression would hurt the most, without a DB:
 * schema migrations, service-worker behaviour, and the hold-to-hide gesture.
 */
describe("v1.6.0 contracts", () => {
  it("ships the announcement columns for telegram_links", () => {
    const joined = MIGRATIONS.join("\n");
    expect(joined).toContain("add column if not exists announce_enabled boolean not null default true");
    expect(joined).toContain("add column if not exists announced_at timestamptz");
    // offline digest is opt-OUT for new links since v1.6.0 (existing rows untouched)
    expect(joined).toContain("alter column offline_notify set default true");
  });

  it("init.sql covers the same columns for fresh installs", () => {
    const sql = readFileSync(new URL("../../sql/init.sql", import.meta.url), "utf8");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS announce_enabled boolean NOT NULL DEFAULT true");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS announced_at timestamptz");
  });

  it("keeps the 5-second hold-to-hide gesture while removing its visuals", () => {
    expect(HOLD_TO_HIDE_MS).toBe(5000);
    const src = readFileSync(new URL("../../src/components/privacy.tsx", import.meta.url), "utf8");
    // the progress bar + "holding…" overlay are gone — the gesture stays silent
    expect(src).not.toContain("t.privacy.holding");
    expect(src).not.toContain("Math.round(progress");
  });

  it("service worker: new cache version + notification click routing", () => {
    const sw = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
    expect(sw).toContain("pc-static-v5");
    expect(sw).toContain("notificationclick");
    expect(sw).toContain("openWindow");
  });

  it("notify manager prefers the service-worker notification channel (Android/PWA)", () => {
    const src = readFileSync(new URL("../../src/components/notify-manager.tsx", import.meta.url), "utf8");
    expect(src).toContain("getRegistration");
    expect(src).toContain("showNotification");
    expect(src).toContain("data: { url:");
  });

  it("chat list polls live (4s) and syncs on entry/focus/visibility", () => {
    const src = readFileSync(new URL("../../src/components/dashboard/chat-list.tsx", import.meta.url), "utf8");
    expect(src).toContain("4000");
    expect(src).toContain('addEventListener("visibilitychange"');
    expect(src).toContain('addEventListener("focus"');
  });

  it("health endpoint exposes the deploy version marker", () => {
    const src = readFileSync(new URL("../../src/app/api/health/route.ts", import.meta.url), "utf8");
    expect(src).toContain("ver: APP_VERSION");
    expect(APP_VERSION).toBe("1.7.0");
  });

  it("announcement sweep + owner bot actions exist", () => {
    const sweep = readFileSync(new URL("../../src/lib/telegram/offline-notify.ts", import.meta.url), "utf8");
    expect(sweep).toContain("export async function sweepAnnouncements");
    const actions = readFileSync(new URL("../../src/app/actions/telegram.ts", import.meta.url), "utf8");
    expect(actions).toContain("savePlatformBotAction");
    expect(actions).toContain("telegramAnnounceAction");
    expect(actions).toContain("isPlatformOwner");
  });
});
