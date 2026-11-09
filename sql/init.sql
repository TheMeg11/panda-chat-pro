-- Panda Chat — full schema (Postgres 13+)
-- Idempotent: safe to run on an empty database.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username varchar(32) NOT NULL UNIQUE,
  display_name varchar(64) NOT NULL,
  password_hash text NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'active',
  can_use_telegram boolean NOT NULL DEFAULT true,
  max_rooms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

CREATE TABLE IF NOT EXISTS sessions (
  id varchar(64) PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  persistent boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  user_agent varchar(256),
  ip varchar(64)
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id varchar(64) PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  user_agent varchar(256),
  ip varchar(64)
);

CREATE TABLE IF NOT EXISTS rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name varchar(80) NOT NULL,
  description varchar(280) NOT NULL DEFAULT '',
  invite_token varchar(96) NOT NULL UNIQUE,
  password_hash text,
  password_version integer NOT NULL DEFAULT 0,
  is_locked boolean NOT NULL DEFAULT false,
  is_disabled boolean NOT NULL DEFAULT false,
  state_version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS rooms_owner_idx ON rooms (owner_id);

-- Private 1:1 chats (found by exact username search) live in the same rooms table.
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS type varchar(16) NOT NULL DEFAULT 'room';

CREATE TABLE IF NOT EXISTS room_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  device_hash varchar(80) NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  nickname varchar(32),
  role varchar(16) NOT NULL DEFAULT 'guest',
  status varchar(16) NOT NULL DEFAULT 'active',
  password_version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS room_members_room_device_uq ON room_members (room_id, device_hash);
CREATE INDEX IF NOT EXISTS room_members_room_idx ON room_members (room_id);

-- Uploaded media. Bytes live in Postgres so they survive redeploys.
-- Rows are hard-deleted 24h after upload (FILES_TTL_HOURS) by the maintenance loop.
CREATE TABLE IF NOT EXISTS files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  member_id uuid REFERENCES room_members(id) ON DELETE SET NULL,
  name varchar(200) NOT NULL,
  mime varchar(100) NOT NULL,
  size integer NOT NULL,
  data bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS files_expires_idx ON files (expires_at);
CREATE INDEX IF NOT EXISTS files_room_idx ON files (room_id);

CREATE TABLE IF NOT EXISTS messages (
  id bigserial PRIMARY KEY,
  room_id uuid NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  member_id uuid REFERENCES room_members(id) ON DELETE SET NULL,
  author_name varchar(64) NOT NULL,
  author_role varchar(16) NOT NULL DEFAULT 'guest',
  source varchar(16) NOT NULL DEFAULT 'web',
  body text NOT NULL,
  file_id uuid REFERENCES files(id) ON DELETE SET NULL,
  file_name varchar(200),
  file_mime varchar(100),
  file_size integer,
  reply_to_id bigint,
  tg_message_id bigint,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_room_id_idx ON messages (room_id, id);
CREATE INDEX IF NOT EXISTS messages_tg_idx ON messages (room_id, tg_message_id);

CREATE TABLE IF NOT EXISTS telegram_bots (
  room_id uuid PRIMARY KEY REFERENCES rooms(id) ON DELETE CASCADE,
  token_encrypted text NOT NULL,
  token_hint varchar(32) NOT NULL,
  bot_id varchar(32) NOT NULL UNIQUE,
  bot_username varchar(64) NOT NULL,
  bot_name varchar(128) NOT NULL DEFAULT '',
  admin_chat_id varchar(32),
  admin_chat_name varchar(128),
  link_code varchar(64),
  forward_enabled boolean NOT NULL DEFAULT true,
  mode varchar(16) NOT NULL DEFAULT 'polling',
  webhook_secret varchar(64) NOT NULL,
  update_offset bigint NOT NULL DEFAULT 0,
  status varchar(16) NOT NULL DEFAULT 'pending',
  last_error text,
  base_url varchar(256),
  last_update_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_settings (
  key varchar(64) PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id bigserial PRIMARY KEY,
  actor varchar(64) NOT NULL,
  action varchar(64) NOT NULL,
  target_type varchar(32),
  target_id varchar(64),
  details text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_logs (created_at);

-- Official platform bot: links a Panda Chat account to a private Telegram chat.
CREATE TABLE IF NOT EXISTS telegram_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  chat_id varchar(32) NOT NULL UNIQUE,
  chat_name varchar(128) NOT NULL DEFAULT '',
  username varchar(64),
  active_room_id uuid REFERENCES rooms(id) ON DELETE SET NULL,
  forward_enabled boolean NOT NULL DEFAULT true,
  muted_rooms jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS telegram_links_user_idx ON telegram_links (user_id);

-- Short-lived /start <code> pairing codes (browser -> Telegram).
CREATE TABLE IF NOT EXISTS telegram_link_codes (
  code varchar(64) PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);
