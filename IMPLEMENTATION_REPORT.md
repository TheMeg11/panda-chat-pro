# Panda Chat Pro — Implementation Report (v1.5.0)

**Date:** 2026-11-10 · **Branch:** `main` · **Deployed to:** https://chat.kanar.ir (Railway project "fearless-wisdom", service "panda-chat")

---

## 1. Production outage — root cause & fix (COMPLETED)

- **Symptom:** site loaded but every DB-backed action returned 500 (`42P01 relation "platform_settings" does not exist`); registration/login broken while `/api/health` returned `{"ok":true}` (liveness-only check masked it).
- **Root causes:** (a) the first GitHub-connected deploy started before `preDeployCommand` was saved, and a later "redeploy" reused the original config — `db-init.mjs` never applied DDL to the runtime DB; (b) `sql/init.sql` at v1.4.0 had `ALTER TABLE telegram_links` statements **before** the `CREATE TABLE` (single-transaction init rolls back entirely on an empty DB) — would have failed any fresh deploy.
- **Fixes:** reordered `init.sql`; `/api/health` now verifies the schema (`select 1 from platform_settings limit 1` → 503 `{"ok":false,"db":"schema-missing"}` when broken); fresh deploy executed pre-deploy init → `[anonchat] database schema ready (20 public tables)`.
- **Verified:** `/api/health` = `{"ok":true,"db":"ready"}`; register/login/logout work in production.

## 2. v1.5.0 features (ALL COMPLETED — E2E browser-verified 12/12)

**Menu redesign** — the dropdown now has 5 sections: Account / Notifications / Security / Telegram bot / About (+ theme/lang, logout).

- **Account:** display name, bio (≤280), single profile picture (png/jpeg/webp, magic-byte sniffed, 64KB–2MB, new replaces old — `user_avatars` table, served auth-gated from `/api/users/[id]/avatar`), logout, account deletion (existing, re-verified), replay tutorial.
- **Notifications:** device-local prefs (master, sound, red-dot favicon badge, message-preview) + browser Notification API with permission handling + test button; NotifyManager polls `/api/chats` (20s visible/60s hidden), fires notifications, WebAudio ding, canvas-drawn favicon badge + "(n)" title counter; unread state via `room_members.last_read_at` + `hasUnread` in `/api/chats`; open room is marked read only while the tab is visible.
- **Security:** password change (existing), NEW password recovery via Telegram one-time code (`/forgot-password`: 6-digit code hashed+salted, 15-min expiry, 5 attempts, anti-enumeration generic responses, 3/h/username + 5/h/IP rate limits, full session revocation on success), active sessions with device/browser detection + "remembered vs until-refresh" semantics (ephemeral sessions still die on refresh).
- **Telegram bot:** existing link/forward/mute settings + NEW per-user offline notify — a 5-minute sweep sends «شما پیام جدید در «<room>» دارید» when a non-E2EE room has a message from someone else ≥15 min old and the recipient hasn't been online since (dedupe via `room_members.tg_notified_at`, capped 50 rooms/sweep, E2EE rooms excluded).
- **About page** (`/dashboard/about`): ported from the provided design ZIP — Getting Started, Rooms, Messaging, Private Chats, Moderation, Telegram, Account, Security, App & Looks, Limits, Tips (trimmed to 4), FAQ (12); ToC scroll-spy, mobile chips, BackToTop; ALL "site version" references removed except ONE footer mention ("Panda Chat V1.5.0"); marketing filler deleted (~half the fluff: hero mockup, overview, concepts, credits, chat/telegram demos); a stealth hyperlink (styled exactly like plain text) on «راه باز کردن فهرست چت‌های مخفی» anchors to the footer version; 5 taps on the version number open the hidden-chats vault: PIN setup when unset, unlock → hidden list + PIN change (real mode only; decoy and panic semantics fully preserved). The same 5-tap flow also remains on the settings page footer.
- **Chat:** emoji picker (~330 emoji, 6 categories + recents), GIF picker via server-side Giphy proxy (search auth-gated 20/min/user; media public 60/min/IP for guests, id charset-validated, fixed host, 10MB hard stream cap, CSP stays `img-src 'self'`), GIF messages (`messages.gif_id`; guests/E2EE blocked from sending; «GIF» quote previews), swipe-to-reply (horizontal swipe ≥72px on a bubble, both directions, tap-to-click suppression, `touch-action pan-y`). Pickers close on Escape as of this commit.
- **Infra:** `next.config` `serverActions.bodySizeLimit` 3mb; `APP_VERSION` synced to 1.5.0.

## 3. Security audit (self-attack review) — 36 scenarios reviewed

**4 real issues found & fixed:** (1) E2EE ciphertext leaked into chat-list/OS-notification previews → replaced with "🔒 E2EE" placeholder server-side; (2) GIF media proxy streamed unbounded when upstream omits content-length → 10MB TransformStream cap; (3) `removeAvatarAction` had no rate limit → 10/10min; (4) anonymous GIF proxy rate 120/min → 60/min per IP.

**Verified safe:** SSRF (fixed hosts + charset ids), SQLi (parameterized drizzle), auth on every new route, uuid validation, mime magic-byte sniffing + nosniff, password-reset anti-enumeration/entropy/timing-safe compares, XFF right-most-IP spoofing resistance, no `dangerouslySetInnerHTML` in new code, CSP byte-identical.

**Accepted risks (documented):** authenticated avatar IDOR by uuid (by design), public GIF media proxy (public content, throttled), hourly reset-request spam nuisance, single-trusted-edge IP model.

## 4. Verification

- `npm run typecheck` / `lint`: clean. Tests: **93 passed, 4 skipped** (DB integration — no local DB).
- `npm run build`: clean; routes `/dashboard/about`, `/forgot-password`, `/api/users/[id]/avatar`, `/api/gifs/search`, `/api/gifs/media/[id]` emitted.
- **Production E2E (headless browser, real user flows): 12/12 PASS** — login (fa/RTL), menu (5 sections), About page (12 ToC entries, exactly ONE version mention, FAQ, BackToTop), 5-tap vault PIN-setup modal, settings anchor nav + account/notifications/security sections, notifications toggles, room creation, emoji picker insert, GIF unconfigured message, message send + reply flow, forgot-password generic response, account deletion + failed re-login. No console errors. 18 screenshots archived.
- Not browser-testable headlessly (code-reviewed only): touch swipe-to-reply, real desktop-notification/sound rendering, offline-notify sweep timing (server-side, runs every 5 min).

## 5. Commits & deployments

- `2bf5c43` fix: sql init ordering + db-aware health check — deployed SUCCESS (schema restored)
- `41e7161` Panda Chat Pro 1.5.0 (full feature release) — deployed SUCCESS (~9.5 min), 20 tables
- `8ee0d23` fix(gifs): graceful degradation when Giphy key is unconfigured/invalid — deployed SUCCESS (~2 min)
- `56b735b` docs: v1.5.0 implementation report + picker Esc fix — deployed in this release

All pushed to `origin/main` (no force). No secrets in any diff (scanned for GitHub/Railway/bot token prefixes).

## 6. Remaining manual steps for the owner

1. **REQUIRED to enable GIF search:** create a free API key at https://developers.giphy.com and set `GIPHY_API_KEY` on the panda-chat Railway service (or `pc_giphy_key` platform setting). Until then the picker shows a specific guidance message. All public/keyless GIF APIs (Giphy beta, Tenor v1) are dead — tested 2026-11-09.
2. **OPTIONAL:** set `TELEGRAM_WEBHOOK_SECRET` if switching `TELEGRAM_MODE` to webhook (documented in `docs/SECURITY.md`).
3. Test swipe-to-reply + real notifications on your phone (touch/permission-bound, verified by code review only).

---

## Previous release (v1.4.0)

v1.4.0 (2026-11-09, commit `11b15ce`) delivered the full security remediation of the 146-line audit plus the 11 security/privacy features — E2EE direct messages, self-destructing messages, decoy PIN & panic mode, hidden-chat privacy hardening, TOTP 2FA with recovery codes, device/session management with new-device Telegram alerts, AES-256-GCM backup encryption, data minimization/retention knobs, hardened security headers, and emergency account deletion — together with the 8-step interactive tutorial, the extended Telegram bot (media, DMs, reply mapping, routing, webhook secret), Postgres-backed distributed rate limiting, and the test suite (93 unit tests, all still green). Its Railway deployment had been blocked by an insufficient token; the v1.5.0 outage post-mortem in §1 explains what that masked.
