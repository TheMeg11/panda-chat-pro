# Panda Chat Pro 🐼

A privacy-first, Telegram-style anonymous chat PWA built with **Next.js 16**, **React 19**, **Tailwind CSS 4** and **PostgreSQL (Drizzle ORM)**.

Live instance: [chat.kanar.ir](https://chat.kanar.ir)

## Features

- 🔒 **Private rooms** — 256-bit invite links, optional room passwords, device-gated membership
- 💬 **1:1 direct messages** — find any account by its *exact* username and start a private chat
- 🧩 **End-to-end encryption (DMs)** — opt-in per conversation; keys are generated in the browser, the server stores ciphertext only ([details](docs/SECURITY.md))
- 🔐 **Two-factor authentication** — RFC 6238 TOTP with any authenticator app (QR + manual secret), single-use recovery codes
- ⏱️ **Self-destructing messages** — per-conversation default (off / 1 h / 24 h / 7 d) plus a per-message override; expired rows are filtered at read time and hard-deleted with their files
- 🕶️ **Hidden chats (vault) + decoy PIN + panic mode** — a second PIN that opens an innocent EMPTY vault, and a panic switch that wipes it
- 🧹 **Auto-hygiene & data minimization** — media expires after 24 h, session IP/UA blanked after 30 d, audit TTL, storage-quota pruning
- ✈️ **Telegram integration (extended)** — one platform bot: linking via `/start`, forwarding, media to/from rooms, `/msg` user-to-user DMs with consent, reply threading across rooms, **default-room fallback routing**, admin-configurable texts/permissions/rate limits, webhook mode with secret + idempotency
- 🧭 **Interactive onboarding tour** — a spotlight guide over the real UI for first-time users (fa/en, RTL, keyboard-accessible, replayable from settings)
- 🛡️ **Super-admin console** — users, rooms, sessions, encrypted backups (nightly, `/restore` supported with deletion tombstones), audit log, bot management, webhook control, storage meter
- 📱 **PWA** — installable, offline shell, multi-size icons

## Tech

| Layer      | Choice                              |
| ---------- | ----------------------------------- |
| Framework  | Next.js 16 (App Router, RSC)        |
| UI         | React 19 + Tailwind CSS 4           |
| DB         | PostgreSQL + Drizzle ORM            |
| Fonts      | Vazirmatn (fa) + Nunito (en)        |
| Icons      | lucide-react                        |

## Getting started

```bash
cp .env.example .env.local   # fill in DATABASE_URL + APP_SECRET + admin creds
npm ci
node scripts/db-init.mjs     # idempotent schema init (safe to re-run)
npm run dev                  # http://localhost:3000
```

Production:

```bash
npm run build
npm start
```

## Environment variables

See `.env.example` for the full annotated list. Highlights:

| Variable                 | Required | Description                                                  |
| ------------------------ | -------- | ------------------------------------------------------------ |
| `DATABASE_URL`           | ✅       | PostgreSQL connection string                                 |
| `APP_SECRET`             | ✅ prod  | Long random string — encrypts secrets at rest; **production refuses to boot without it** |
| `BACKUP_ENCRYPTION_KEY`  | –        | Dedicated AES-256-GCM key for backups (keep a copy offline!) |
| `SUPERADMIN_CHAT_ID`     | –        | Telegram chat that owns `/backup /restore /platform`        |
| `ADMIN_PATH`             | –        | Secret path for the super-admin console (`/<path>`)          |
| `ADMIN_USERNAME`         | –        | Super-admin username                                         |
| `ADMIN_PASSWORD`         | –        | Super-admin password (or `ADMIN_PASSWORD_HASH`)              |
| `TELEGRAM_MODE`          | –        | `polling` (default) or `webhook`                             |
| `WEBHOOK_SECRET`         | webhook  | Min 16 chars; gates `/api/telegram/webhook/platform`         |
| `FILES_MAX_MB`           | –        | Max upload size (default 15)                                 |
| `FILES_TTL_HOURS`        | –        | Media retention (default 24)                                 |
| `STORAGE_QUOTA_MB`       | –        | DB size that triggers pruning (default 800)                  |
| `AUDIT_TTL_DAYS`         | –        | Audit-log retention (default 90)                             |
| `IP_RETENTION_DAYS`      | –        | Session IP/UA retention before blanking (default 30)         |
| `E2EE_ENABLED`           | –        | Feature flag for DM encryption (default on, per-chat opt-in) |
| `CSP_REPORT_ONLY`        | –        | Pilot the CSP in Report-Only mode before enforcing           |
| `GIPHY_API_KEY`          | –        | Optional: Giphy API key for the GIF picker (get a free key at developers.giphy.com) |

## Tests & CI

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # vitest (93+ unit tests; integration tests need DATABASE_URL)
npm run build       # production build
```

CI (`.github/workflows/ci.yml`) runs lint + typecheck + unit tests, the
integration suite against a real PostgreSQL service (schema init, idempotent
migrations, distributed rate limiter) and a production build on every push.

## Security model

Short version — the full threat model, crypto inventory and honest limits live
in [docs/SECURITY.md](docs/SECURITY.md).

- Session tokens: HttpOnly cookies, sha256-hashed at rest, optional "remember me" + ephemeral sessions
- Login hardening: 2FA (TOTP + recovery codes), new-device Telegram alerts, distributed rate limiting
- Room passwords: scrypt, versioned — changing a password re-gates every member
- Bot tokens / TOTP secrets: AES-256-GCM encrypted with `APP_SECRET` (domain-separated)
- Backups: AES-256-GCM encrypted archives before they are sent to Telegram
- Uploads: magic-byte sniffing, hard size cap, MIME allow-list, 24 h hard delete
- Exact-username search only — no directory enumeration; rate-limited
- E2EE DMs: browser-held keys (ECDH P-256 + HKDF + AES-GCM), server stores ciphertext only
- The hidden-chat vault lives **only on the device** (localStorage + PIN/decoy verifier) — the server has no notion of "hidden", and the chat list never ships in SSR HTML
