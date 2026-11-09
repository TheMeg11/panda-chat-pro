# Security model — Panda Chat Pro 1.4.0

This document explains what is actually protected, how, and what the known
limits are. It accompanies the 2026 security-audit remediation.

## Threat model

| Attacker | Protected against |
| --- | --- |
| Another platform user | Room passwords, unguessable 256-bit invite tokens, exact-username-only search, DM consent (`allowBotDm`), per-room access control re-checked on every request |
| A compromised server / hosting provider (DMs) | **E2EE for direct messages** — the server only stores ciphertext (see below) |
| Session hijacking | HttpOnly cookies, sha256-hashed tokens at rest, ephemeral sessions revoked on page load, password change kills all sessions, 2FA (TOTP), new-device Telegram alerts, per-session revoke |
| CSRF | Origin checks hardened with `Sec-Fetch-Site`, opaque-origin rejection, Next.js Server Action origin checks |
| Someone with your phone | Hidden-chat vault (device-local), decoy PIN, panic mode, self-destructing messages |
| Leaked backups | AES-256-GCM encrypted archives (PCENC1), dedicated key, tombstoned account deletions re-applied on restore |
| Rate-limit bypass across replicas | Distributed Postgres-backed rate limiting (`rate_limit_buckets`) |

## Cryptography used (audited primitives only — nothing custom)

| Purpose | Primitive |
| --- | --- |
| Password storage | scrypt (N=16384, r=8, p=1), per-user salt |
| Secret at rest (bot tokens, TOTP secrets) | AES-256-GCM, key = HMAC-SHA256(APP_SECRET, domain label) |
| Backup archives | AES-256-GCM (PCENC1 envelope), key = HMAC-SHA256(BACKUP_ENCRYPTION_KEY or APP_SECRET, backup label) |
| 2FA | RFC 6238 TOTP (HMAC-SHA1, 6 digits, 30 s, ±1 step) — compatible with Google Authenticator |
| E2EE identity | ECDH P-256 keypair (WebCrypto), private key wrapped with AES-256-GCM under PBKDF2-SHA256(account password, 310k iterations) |
| E2EE messages/files | AES-256-GCM per message/file, key = HKDF-SHA256(ECDH secret, room id salt) |
| Recovery codes | 10 × 47-bit, stored as sha256 hashes, single-use |
| Constant-time comparison | sha256 both inputs → `timingSafeEqual` (length-independent) |

**Audit note (false positive, kept for the record):** the external audit
claimed `safeEqual` "throws when input lengths differ". Both inputs are hashed
to fixed-length 32-byte digests BEFORE `timingSafeEqual`, so a length mismatch
can never occur. The claim was verified false and no behavioural "fix" was
applied — only type hardening and this documentation.

## End-to-end encryption (DMs) — design and limits

- Opt-in per conversation; **both participants must publish a keypair** first.
- Private keys are generated in the browser and only ever stored server-side
  **wrapped** by the account password. The server never sees the raw private
  key or the wrapping key. Multi-device works because any device that can log
  in can unwrap the same key.
- Per-message key derivation: ECDH(my private, peer public) → HKDF-SHA256 with
  the room id as salt. Compromise of one conversation does not leak others.
- Files are encrypted with the same conversation key before upload; the
  original filename/mime travel inside the encrypted message body.
- **The server rejects plaintext bodies for E2EE rooms** (`e2eeRequired`) —
  it cannot be tricked into storing readable text.
- Telegram forwarding is disabled for E2EE conversations; `/recent`, `/send`
  and routing destinations exclude them. The bot never receives ciphertext
  and the server never acts as a decryption oracle.

Known limits (by design, stated honestly):

1. **Metadata is not encrypted**: author display names, timestamps, reply
   graph and file sizes remain visible to the server.
2. **Pre-E2EE history stays plaintext** — nothing is retroactively "encrypted"
   to fake security.
3. **Identity is trust-on-first-use**: key authenticity is bound to the
   account (password change re-wraps), without a separate safety-number
   verification ceremony.
4. Group rooms (invite-link rooms) are server-readable; E2EE covers 1:1 DMs.
5. The browser environment must be trusted (as with every web E2EE).

## Self-destructing messages

Conversation default (off / 1 h / 24 h / 7 d) plus per-send override. The
deadline is stored (`expires_at`), filtered at READ time (an expired row is
never served, even between sweeps) and hard-deleted together with the attached
file by the maintenance loop.

## Vault, decoy PIN, panic mode

- Hidden-chat membership lives ONLY in the device localStorage; the server has
  no notion of "hidden".
- The conversation list is fetched client-side (`/api/chats`, `no-store`) so
  hidden chats never appear in the SSR HTML (audit §4.4 fix).
- Decoy PIN unlocks an **empty, ordinary vault** — indistinguishable from a
  device where nothing is hidden.
- Panic mode: unlocking with the decoy PIN **wipes the vault locally** and
  locks the session. An emergency wipe button lives in Account settings.

## Data minimization

- Session IP/User-Agent blanked after `IP_RETENTION_DAYS` (default 30).
- Audit logs purged after `AUDIT_TTL_DAYS` (default 90); message bodies are
  never written to logs or audit entries.
- Expired media hard-deleted (default 24 h TTL); storage-quota pruning targets
  oldest messages first.
- Account deletion: cascades owned rooms/files, anonymizes guest messages,
  severs the Telegram link with a final notice, and writes a **tombstone** so a
  later backup restore re-applies the deletion.

## Security headers

`X-Content-Type-Options`, `Referrer-Policy: same-origin`,
`Permissions-Policy` (camera/mic/geo/payment/usb/interest-cohort denied),
`X-Frame-Options: DENY`, `X-Robots-Tag: noindex, nofollow`, HSTS, COOP/CORP
`same-origin`, and a strict CSP (`default-src 'self'`, `frame-ancestors
'none'`, `object-src 'none'`, `form-action 'self'`).

Set `CSP_REPORT_ONLY=1` to pilot a tightened policy in Report-Only mode before
enforcing it (§4.9 procedure).

## Screenshot / screen-recording leakage

What is actually done: chat APIs and the chat list are `no-store`; the service
worker never caches pages or API responses; an optional per-user watermark
(username + date, near-invisible tile) overlays conversations; local vault
wiping removes hidden traces. What browsers cannot give us: a reliable way to
block screenshots or screen recording from a web page. This is stated plainly
instead of being faked.

## Secrets policy

- `APP_SECRET` is **required** in production — the app refuses to boot without
  it (no more DATABASE_URL-derived key fallback).
- `BACKUP_ENCRYPTION_KEY` is the offline recovery key for backups; keep a copy
  outside Telegram.
- `WEBHOOK_SECRET` (min 16 chars) gates `/api/telegram/webhook/platform`;
  without it the route answers 403.
- Tokens are never rendered in the admin UI (masked hints only) and never
  logged.
