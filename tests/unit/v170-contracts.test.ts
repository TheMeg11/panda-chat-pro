import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MIGRATIONS } from "../../scripts/db-migrate.mjs";
import { APP_VERSION } from "../../src/lib/version";

/**
 * v1.6.0 contracts — the sync / notification / bot-from-site release.
 * These pin the pieces that a regression would hurt the most, without a DB:
 * schema migrations, service-worker behaviour, and the hold-to-hide gesture.
 */
describe("v1.6.0 contracts", () => {
  it("ships the v2.6.0 telegram-removal migrations", () => {
    const joined = MIGRATIONS.join("\n");
    // v2.6.0 — the Telegram integration is gone: dead tables/columns drop.
    expect(joined).toContain("drop table if exists telegram_links");
    expect(joined).toContain("drop table if exists telegram_bots");
    expect(joined).toContain("drop table if exists telegram_link_codes");
    expect(joined).toContain("drop table if exists password_resets");
    expect(joined).toContain("alter table users drop column if exists can_use_telegram");
  });

  it("init.sql covers the same drops for existing installs", () => {
    const sql = readFileSync(new URL("../../sql/init.sql", import.meta.url), "utf8");
    expect(sql).toContain("DROP TABLE IF EXISTS telegram_links");
    expect(sql).toContain("DROP TABLE IF EXISTS telegram_bots");
    expect(sql.toUpperCase()).not.toContain("CREATE TABLE IF NOT EXISTS TELEGRAM_LINKS");
  });

  it("v2.2.0: hold-to-hide is replaced by the instant server action", () => {
    const menu = readFileSync(new URL("../../src/components/chat/chat-menu.tsx", import.meta.url), "utf8");
    expect(menu).toContain("hideChatAction");
    const privacy = readFileSync(new URL("../../src/components/privacy.tsx", import.meta.url), "utf8");
    expect(privacy).not.toContain("HOLD_TO_HIDE");
    expect(privacy).not.toContain("localStorage");
  });

  it("v2.3.0: voice messages — recorder, composer mic flow, player + upload path", () => {
    const voice = readFileSync(new URL("../../src/components/chat/voice.tsx", import.meta.url), "utf8");
    expect(voice).toContain("MediaRecorder");
    expect(voice).toContain("getUserMedia");
    expect(voice).toContain("VoicePlayer");
    expect(voice).toContain("Infinity"); // WebM duration probe workaround
    // v2.4.1: browsers without MediaRecorder record via the WAV fallback.
    expect(voice).toContain("encodeWav");
    expect(voice).toContain("createScriptProcessor");
    const view = readFileSync(new URL("../../src/components/chat/chat-view.tsx", import.meta.url), "utf8");
    expect(view).toContain("useVoiceRecorder");
    // v2.4.1: the Animorio pill flow replaced the old review-bar sendVoice.
    expect(view).toContain("RecordingPill");
    expect(view).toContain("stopAndSend");
    expect(view).toContain("t.chat.micRecord");
    // voice rides the regular attachment upload — file bubble routes voice-*.webm
    expect(view).toContain("/^voice-/");
  });

  it("v2.3.0: live DM presence + weak-network resilience", () => {
    const chat = readFileSync(new URL("../../src/lib/chat.ts", import.meta.url), "utf8");
    expect(chat).toContain("peerLastSeenAt");
    expect(chat).toContain("45 seconds");
    const view = readFileSync(new URL("../../src/components/chat/chat-view.tsx", import.meta.url), "utf8");
    expect(view).toContain("t.dm.lastSeenOnline");
    expect(view).toContain("AbortSignal.timeout");
    expect(view).toContain("setRetryable");
    const list = readFileSync(new URL("../../src/components/dashboard/chat-list.tsx", import.meta.url), "utf8");
    expect(list).toContain("AbortSignal.timeout(10_000)");
    // the dmCreated marker never reads as a preview anywhere
    const rooms = readFileSync(new URL("../../src/lib/rooms.ts", import.meta.url), "utf8");
    expect(rooms).toContain('body === "dmCreated"');
  });

  it("service worker: new cache version + notification click routing", () => {
    const sw = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
    // v2.3.0 — cache bumped to v6 so stale PWA bundles (users still seeing
    // pre-2.2 UI, e.g. the old "dmCreated" preview) refresh automatically.
    expect(sw).toContain("pc-static-v6");
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
    // dynamic: the marker must track the release version, whatever it is
    expect(/^\d+\.\d+\.\d+$/.test(APP_VERSION)).toBe(true);
  });

  it("v1.8.0 mobile UX contracts: unread dot, DM parity, double-tap reply, composer sheet, captcha", () => {
    // red unread dot on the chat list
    const list = readFileSync(new URL("../../src/components/dashboard/chat-list.tsx", import.meta.url), "utf8");
    expect(list).toContain("chat.hasUnread");
    // DMs: no owner badge + peer avatar + back button
    const chat = readFileSync(new URL("../../src/components/chat/chat-view.tsx", import.meta.url), "utf8");
    expect(chat).toContain("suppressOwnerBadge");
    expect(chat).toContain("peerAvatarSrc");
    expect(chat).toContain("onDoubleClick");
    expect(chat).toContain("lastTapRef");
    expect(chat).toContain("setSheetOpen");
    const dm = readFileSync(new URL("../../src/components/dashboard/dm-workspace.tsx", import.meta.url), "utf8");
    expect(dm).toContain('href="/dashboard"');
    expect(dm).toContain("suppressOwnerBadge");
    // register captcha is verified server-side
    const auth = readFileSync(new URL("../../src/app/actions/auth.ts", import.meta.url), "utf8");
    expect(auth).toContain("verifyCaptcha");
  });
});
