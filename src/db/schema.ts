import {
  bigint,
  bigserial,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
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
  /** optional public profile description (max 280 chars) */
  bio: varchar("bio", { length: 280 }),
  /** active | suspended */
  status: varchar("status", { length: 16 }).notNull().default("active"),
  /** Per-user room limit override (null = platform default) */
  maxRooms: integer("max_rooms"),
  /** v2.2.0 — scrypt hash of the hidden-chats vault PIN (server-side now) */
  hiddenPinHash: text("hidden_pin_hash"),
  /** v2.5.0 (B-01) — scrypt hash of the DECOY PIN: entering it in the vault
   *  dialog shows an innocent empty vault instead of the real hidden list. */
  decoyPinHash: text("decoy_pin_hash"),
  /** v2.5.0 (B-02) — panic mode: with this ON, entering the decoy PIN wipes
   *  every hidden chat on the account and locks the current session. */
  panicMode: boolean("panic_mode").notNull().default(false),
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
/* Two-factor authentication (TOTP + recovery codes)                    */
/* ------------------------------------------------------------------ */

/** TOTP secret per account — AES-256-GCM encrypted at rest (APP_SECRET). */
export const twoFactor = pgTable("two_factor", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** AES-256-GCM encrypted base32 TOTP secret (encryptSecret) */
  secretEncrypted: text("secret_encrypted").notNull(),
  /** pending until the first successful code verification */
  enabledAt: ts("enabled_at"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** One-time recovery codes — only sha256 hashes are stored. */
export const recoveryCodes = pgTable(
  "recovery_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** sha256 of the 10-char code shown to the user exactly once */
    codeHash: varchar("code_hash", { length: 64 }).notNull(),
    usedAt: ts("used_at"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("recovery_codes_user_idx").on(t.userId)],
);

/* ------------------------------------------------------------------ */
/* Interactive onboarding tutorial state                                */
/* ------------------------------------------------------------------ */

/** Per-user tutorial progress so the tour shows exactly once per version. */
export const userOnboarding = pgTable("user_onboarding", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** tutorial content version the user last saw */
  tutorialVersion: integer("tutorial_version").notNull().default(1),
  /** pending | completed | skipped */
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  completedAt: ts("completed_at"),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/**
 * v1.7.0 — DM blocks: one row per blocker → blocked pair. The send path checks
 * a block row between the two DM participants in BOTH directions, so either
 * side blocking freezes the 1:1 conversation for both participants.
 */
/**
 * v2.2.0 — chats the user hid from their list. SERVER-side per account now:
 * hiding survives reloads, browsers and devices exactly like every other
 * account setting (the old device-local localStorage vault kept "reverting"
 * on browsers that evict storage). `listDashboardChats` excludes these rows.
 */
export const hiddenRooms = pgTable(
  "hidden_rooms",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
    hiddenAt: ts("hidden_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.roomId] })],
);

export const userBlocks = pgTable(
  "user_blocks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    blockerId: uuid("blocker_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blockedId: uuid("blocked_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("user_blocks_pair_idx").on(t.blockerId, t.blockedId)],
);

/* ------------------------------------------------------------------ */
/* End-to-end encryption key material (client-generated, server-blind)   */
/* ------------------------------------------------------------------ */

/**
 * Per-user E2EE identity: the PUBLIC key is stored in the clear so peers can
 * encrypt; the PRIVATE key is stored wrapped with a key derived from the
 * account password via PBKDF2 IN THE BROWSER — the server never sees either
 * the raw private key or the password-derived wrapping key.
 */
export const e2eeKeys = pgTable("e2ee_keys", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** JSON Web Key (public ECDH P-256 key) */
  publicKeyJwk: text("public_key_jwk").notNull(),
  /** AES-GCM ciphertext of the private JWK, wrapped by the client */
  wrappedPrivateKey: text("wrapped_private_key").notNull(),
  /** base64url PBKDF2 salt used by the client to derive the wrapping key */
  kdfSalt: varchar("kdf_salt", { length: 64 }).notNull(),
  /** PBKDF2 iteration count (client-side, can be raised over time) */
  kdfIterations: integer("kdf_iterations").notNull().default(310_000),
  /** key scheme version for future rotation */
  keyVersion: integer("key_version").notNull().default(1),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/* ------------------------------------------------------------------ */
/* Distributed rate limiting (Postgres-backed, multi-instance safe)     */
/* ------------------------------------------------------------------ */

/** Shared fixed-window buckets so every server instance counts together. */
export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    /** `<scope>:<key>` identifier */
    bucketKey: varchar("bucket_key", { length: 200 }).primaryKey(),
    count: integer("count").notNull().default(0),
    /** epoch ms when the current window ends */
    resetAt: bigint("reset_at", { mode: "number" }).notNull(),
  },
  (t) => [index("rate_limit_reset_idx").on(t.resetAt)],
);

/* ------------------------------------------------------------------ */
/* Account deletion tombstones (survive restores)                        */
/* ------------------------------------------------------------------ */

/**
 * Users who emergency-deleted their account. Restore re-applies the deletion
 * policy for these ids so deleted accounts cannot come back from a backup.
 */
export const deletedAccounts = pgTable("deleted_accounts", {
  userId: uuid("user_id").primaryKey(),
  username: varchar("username", { length: 32 }).notNull(),
  deletedAt: ts("deleted_at").notNull().defaultNow(),
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
    /** E2EE flag — only DMs; when true the server stores ciphertext only */
    e2eeEnabled: boolean("e2ee_enabled").notNull().default(false),
    /** default self-destruct TTL in seconds (null = off; 3600 | 86400 | 604800) */
    defaultTtl: integer("default_ttl"),
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
    /** last time an authenticated member READ this room (unread tracking) */
    lastReadAt: ts("last_read_at"),
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
    /** web | system */
    source: varchar("source", { length: 16 }).notNull().default("web"),
    body: text("body").notNull(),
    /** Giphy gif id — the browser renders it through the server proxy route */
    gifId: varchar("gif_id", { length: 64 }),
    fileId: uuid("file_id").references(() => files.id, { onDelete: "set null" }),
    fileName: varchar("file_name", { length: 200 }),
    fileMime: varchar("file_mime", { length: 100 }),
    fileSize: integer("file_size"),
    replyToId: bigint("reply_to_id", { mode: "number" }),
    deletedAt: ts("deleted_at"),
    /** self-destruct deadline — null means "keep"; set from room defaultTtl or per-send override */
    expiresAt: ts("expires_at"),
    /** true when body is an E2EE envelope the server cannot read */
    encrypted: boolean("encrypted").notNull().default(false),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("messages_room_id_idx").on(t.roomId, t.id)],
);

/* ------------------------------------------------------------------ */
/* Profile avatars (one per account)                                   */
/* ------------------------------------------------------------------ */

/**
 * A user's profile picture. Bytes live in Postgres exactly like room media,
 * sniffed from magic bytes before insert; a new upload replaces the old row.
 */
export const userAvatars = pgTable("user_avatars", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** sniffed from magic bytes — never trusted from the client */
  mime: varchar("mime", { length: 32 }).notNull(),
  data: bytea("data").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

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
export type FileRow = typeof files.$inferSelect;
export type UserAvatar = typeof userAvatars.$inferSelect;
