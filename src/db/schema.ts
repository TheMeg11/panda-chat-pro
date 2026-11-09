import {
  bigint,
  bigserial,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true });

/** Postgres bytea — holds uploaded file bytes. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/* ------------------------------------------------------------------ */
/* Accounts & sessions                                                 */
/* ------------------------------------------------------------------ */

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: varchar("username", { length: 32 }).notNull().unique(),
  displayName: varchar("display_name", { length: 64 }).notNull(),
  passwordHash: text("password_hash").notNull(),
  /** active | suspended */
  status: varchar("status", { length: 16 }).notNull().default("active"),
  /** Access permission managed by the Super Admin */
  canUseTelegram: boolean("can_use_telegram").notNull().default(true),
  /** Per-user room limit override (null = platform default) */
  maxRooms: integer("max_rooms"),
  createdAt: ts("created_at").notNull().defaultNow(),
  lastLoginAt: ts("last_login_at"),
});

export const sessions = pgTable(
  "sessions",
  {
    /** sha256 of the opaque session token — the raw token only lives in an HttpOnly cookie */
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** true = "Remember me" (survives browser restarts), false = ends on refresh */
    persistent: boolean("persistent").notNull().default(false),
    expiresAt: ts("expires_at").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
    userAgent: varchar("user_agent", { length: 256 }),
    ip: varchar("ip", { length: 64 }),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const adminSessions = pgTable("admin_sessions", {
  id: varchar("id", { length: 64 }).primaryKey(),
  expiresAt: ts("expires_at").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
  userAgent: varchar("user_agent", { length: 256 }),
  ip: varchar("ip", { length: 64 }),
});

/* ------------------------------------------------------------------ */
/* Rooms                                                               */
/* ------------------------------------------------------------------ */

export const rooms = pgTable(
  "rooms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** "room" = classic invite-link room, "dm" = 1:1 private chat found by username */
    type: varchar("type", { length: 16 }).notNull().default("room"),
    name: varchar("name", { length: 80 }).notNull(),
    description: varchar("description", { length: 280 }).notNull().default(""),
    /** 256-bit random, URL-safe invitation token */
    inviteToken: varchar("invite_token", { length: 96 }).notNull().unique(),
    /** scrypt hash of the optional room password (null = no password) */
    passwordHash: text("password_hash"),
    /** bumped whenever the password changes so every guest must re-enter it */
    passwordVersion: integer("password_version").notNull().default(0),
    /** owner lock: guests can read but not send */
    isLocked: boolean("is_locked").notNull().default(false),
    /** admin switch: room is unavailable to everyone */
    isDisabled: boolean("is_disabled").notNull().default(false),
    /** bumped on structural changes (deletes, clears) so clients resync */
    stateVersion: integer("state_version").notNull().default(0),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    lastActivityAt: ts("last_activity_at").notNull().defaultNow(),
  },
  (t) => [index("rooms_owner_idx").on(t.ownerId)],
);

export const roomMembers = pgTable(
  "room_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    /** sha256 of the HttpOnly device cookie, or "owner:<userId>" for the owner */
    deviceHash: varchar("device_hash", { length: 80 }).notNull(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    nickname: varchar("nickname", { length: 32 }),
    /** owner | guest */
    role: varchar("role", { length: 16 }).notNull().default("guest"),
    /** active | banned */
    status: varchar("status", { length: 16 }).notNull().default("active"),
    /** room password version this member unlocked */
    passwordVersion: integer("password_version").notNull().default(0),
    createdAt: ts("created_at").notNull().defaultNow(),
    lastSeenAt: ts("last_seen_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("room_members_room_device_uq").on(t.roomId, t.deviceHash),
    index("room_members_room_idx").on(t.roomId),
  ],
);

export const files = pgTable(
  "files",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").references(() => roomMembers.id, { onDelete: "set null" }),
    name: varchar("name", { length: 200 }).notNull(),
    /** sniffed from magic bytes — never trusted from the client */
    mime: varchar("mime", { length: 100 }).notNull(),
    size: integer("size").notNull(),
    data: bytea("data").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    /** media auto-expires (default 24h) and is hard-deleted by the maintenance loop */
    expiresAt: ts("expires_at").notNull(),
  },
  (t) => [index("files_expires_idx").on(t.expiresAt), index("files_room_idx").on(t.roomId)],
);

export const messages = pgTable(
  "messages",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    memberId: uuid("member_id").references(() => roomMembers.id, { onDelete: "set null" }),
    authorName: varchar("author_name", { length: 64 }).notNull(),
    /** owner | guest | system */
    authorRole: varchar("author_role", { length: 16 }).notNull().default("guest"),
    /** web | telegram | system */
    source: varchar("source", { length: 16 }).notNull().default("web"),
    body: text("body").notNull(),
    fileId: uuid("file_id").references(() => files.id, { onDelete: "set null" }),
    fileName: varchar("file_name", { length: 200 }),
    fileMime: varchar("file_mime", { length: 100 }),
    fileSize: integer("file_size"),
    replyToId: bigint("reply_to_id", { mode: "number" }),
    /** message id of the forwarded copy inside the owner's Telegram chat */
    tgMessageId: bigint("tg_message_id", { mode: "number" }),
    deletedAt: ts("deleted_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("messages_room_id_idx").on(t.roomId, t.id),
    index("messages_tg_idx").on(t.roomId, t.tgMessageId),
  ],
);

/* ------------------------------------------------------------------ */
/* Telegram bot integration (one bot per room)                         */
/* ------------------------------------------------------------------ */

export const telegramBots = pgTable("telegram_bots", {
  roomId: uuid("room_id")
    .primaryKey()
    .references(() => rooms.id, { onDelete: "cascade" }),
  /** AES-256-GCM encrypted bot token — never sent to the browser */
  tokenEncrypted: text("token_encrypted").notNull(),
  tokenHint: varchar("token_hint", { length: 32 }).notNull(),
  botId: varchar("bot_id", { length: 32 }).notNull().unique(),
  botUsername: varchar("bot_username", { length: 64 }).notNull(),
  botName: varchar("bot_name", { length: 128 }).notNull().default(""),
  /** private chat id of the room owner once linked through /start <code> */
  adminChatId: varchar("admin_chat_id", { length: 32 }),
  adminChatName: varchar("admin_chat_name", { length: 128 }),
  linkCode: varchar("link_code", { length: 64 }),
  forwardEnabled: boolean("forward_enabled").notNull().default(true),
  /** polling | webhook */
  mode: varchar("mode", { length: 16 }).notNull().default("polling"),
  webhookSecret: varchar("webhook_secret", { length: 64 }).notNull(),
  updateOffset: bigint("update_offset", { mode: "number" }).notNull().default(0),
  /** pending | active | error */
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  lastError: text("last_error"),
  baseUrl: varchar("base_url", { length: 256 }),
  lastUpdateAt: ts("last_update_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Telegram — one platform bot, per-account links                       */
/* ------------------------------------------------------------------ */

/** A Panda Chat account linked to a private Telegram chat of the platform bot. */
export const telegramLinks = pgTable(
  "telegram_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: "cascade" }),
    /** private chat id with the platform bot — one chat can hold one account */
    chatId: varchar("chat_id", { length: 32 }).notNull().unique(),
    chatName: varchar("chat_name", { length: 128 }).notNull().default(""),
    username: varchar("username", { length: 64 }),
    /** room the bot commands currently act on */
    activeRoomId: uuid("active_room_id").references(() => rooms.id, { onDelete: "set null" }),
    /** master switch for message forwarding */
    forwardEnabled: boolean("forward_enabled").notNull().default(true),
    /** rooms muted for notifications (uuid strings) */
    mutedRooms: jsonb("muted_rooms").$type<string[]>().notNull().default([]),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("telegram_links_user_idx").on(t.userId)],
);

/** Short-lived /start codes that pair a browser account with a Telegram chat. */
export const telegramLinkCodes = pgTable("telegram_link_codes", {
  code: varchar("code", { length: 64 }).primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: ts("created_at").notNull().defaultNow(),
  expiresAt: ts("expires_at").notNull(),
});

export type TelegramLink = typeof telegramLinks.$inferSelect;
export type TelegramLinkCode = typeof telegramLinkCodes.$inferSelect;

/* ------------------------------------------------------------------ */
/* Platform                                                            */
/* ------------------------------------------------------------------ */

export const platformSettings = pgTable("platform_settings", {
  key: varchar("key", { length: 64 }).primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    actor: varchar("actor", { length: 64 }).notNull(),
    action: varchar("action", { length: 64 }).notNull(),
    targetType: varchar("target_type", { length: 32 }),
    targetId: varchar("target_id", { length: 64 }),
    details: text("details"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("audit_created_idx").on(t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Room = typeof rooms.$inferSelect;
export type RoomMember = typeof roomMembers.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type TelegramBot = typeof telegramBots.$inferSelect;
export type FileRow = typeof files.$inferSelect;
