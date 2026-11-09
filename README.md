# Panda Chat Pro 🐼

A privacy-first, Telegram-style anonymous chat PWA built with **Next.js 16**, **React 19**, **Tailwind CSS 4** and **PostgreSQL (Drizzle ORM)**.

Live instance: [chat.kanar.ir](https://chat.kanar.ir)

## Features

- 🔒 **Private rooms** — 256-bit invite links, optional room passwords, device-gated membership
- 💬 **1:1 direct messages** — find any account by its *exact* username and start a private chat
- 🕶️ **Hidden chats (vault)** — hide any conversation behind a device-only PIN; hidden chats are never rendered in any list, count or statistic (pre-paint CSS), so shoulder-surfers learn nothing
- 🧹 **Auto-hygiene** — media expires after 24 h, storage-quota pruning, old-chat cleanup (background maintenance loop)
- ✈️ **Telegram integration** — one platform bot: account linking via `/start` deep-link, message forwarding, slash-command management, paid-mode access flag
- 🛡️ **Super-admin console** — users, rooms, sessions, backups (nightly, `/restore` supported), audit log, platform settings, storage meter
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

| Variable            | Required | Description                                            |
| ------------------- | -------- | ------------------------------------------------------ |
| `DATABASE_URL`      | ✅       | PostgreSQL connection string                            |
| `APP_SECRET`        | ✅       | Long random string — encrypts bot tokens at rest        |
| `ADMIN_PATH`        | –        | Secret path for the super-admin console (`/<path>`)     |
| `ADMIN_USERNAME`    | –        | Super-admin username                                    |
| `ADMIN_PASSWORD`    | –        | Super-admin password (or `ADMIN_PASSWORD_HASH`)         |
| `TELEGRAM_MODE`     | –        | `polling` (default) or `webhook`                        |
| `FILES_MAX_MB`      | –        | Max upload size (default 15)                            |
| `FILES_TTL_HOURS`   | –        | Media retention (default 24)                            |
| `STORAGE_QUOTA_MB`  | –        | DB size that triggers pruning (default 800)             |

## Security model (short version)

- Session tokens: HttpOnly cookies, sha256-hashed at rest, optional "remember me" + ephemeral sessions
- Room passwords: scrypt, versioned — changing a password re-gates every member
- Bot tokens: AES-256-GCM encrypted with `APP_SECRET`
- Uploads: magic-byte sniffing, hard size cap, MIME allow-list, 24 h hard delete
- Exact-username search only — no directory enumeration; rate-limited
- The hidden-chat vault lives **only on the device** (localStorage + PIN verifier) — the server has no notion of "hidden"
