import { and, asc, desc, eq, gt, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { messages, roomMembers, rooms, files, type Message, type Room } from "@/db/schema";

export type ChatFile = {
  id: string;
  name: string;
  mime: string;
  size: number;
};

export type ChatMessage = {
  id: number;
  body: string;
  authorName: string;
  authorRole: "owner" | "guest" | "system";
  source: "web" | "telegram" | "system";
  memberId: string | null;
  createdAt: string;
  mine: boolean;
  canDelete: boolean;
  file: ChatFile | null;
  /** Giphy gif id — rendered through the server proxy route (auth required) */
  gifId: string | null;
  replyTo: { id: number; authorName: string; body: string; deleted: boolean } | null;
  /** true when body is an E2EE envelope the server cannot read */
  encrypted: boolean;
  /** self-destruct deadline (ISO) — the row vanishes from feeds once passed */
  expiresAt: string | null;
};

export type ChatRoomInfo = {
  id: string;
  name: string;
  description: string;
  isLocked: boolean;
  hasPassword: boolean;
  memberCount: number;
  onlineCount: number;
  /** E2EE enabled on this conversation (DMs only) */
  e2eeEnabled: boolean;
  /** default self-destruct TTL in seconds (null = off) */
  defaultTtl: number | null;
  /** Optional header subtitle override (e.g. "@username" for 1:1 chats) */
  subtitle?: string;
  /** true for 1:1 chats — renders round avatars and hides member/online counts */
  direct?: boolean;
};

export type Viewer = { memberId: string; nickname: string; role: "owner" | "guest" };

export type ChatSnapshot = {
  messages: ChatMessage[];
  stateVersion: number;
  reset: boolean;
  room: ChatRoomInfo;
  me: Viewer;
};

const WINDOW = 150;

/** Server-side display override for 1:1 chats (peer name + @username, round avatar). */
export type ChatRoomOverride = Partial<Pick<ChatRoomInfo, "name" | "subtitle" | "direct" | "description">>;

export async function buildSnapshot(
  room: Room,
  viewer: Viewer,
  afterId: number,
  clientVersion: number | null,
  roomOverride?: ChatRoomOverride,
): Promise<ChatSnapshot> {
  const reset = afterId <= 0 || clientVersion === null || clientVersion !== room.stateVersion;
  // Self-destructing messages are filtered at READ time so an expired row is
  // never served even between maintenance sweeps.
  const notExpired = or(isNull(messages.expiresAt), gt(messages.expiresAt, new Date()));
  let rows: Message[];
  if (reset) {
    rows = (
      await db
        .select()
        .from(messages)
        .where(and(eq(messages.roomId, room.id), isNull(messages.deletedAt), notExpired))
        .orderBy(desc(messages.id))
        .limit(WINDOW)
    ).reverse();
  } else {
    rows = await db
      .select()
      .from(messages)
      .where(and(eq(messages.roomId, room.id), isNull(messages.deletedAt), notExpired, gt(messages.id, afterId)))
      .orderBy(asc(messages.id))
      .limit(200);
  }

  const replyIds = [...new Set(rows.map((r) => r.replyToId).filter((v): v is number => typeof v === "number"))];
  const replies = new Map<number, NonNullable<ChatMessage["replyTo"]>>();
  if (replyIds.length) {
    const targets = await db
      .select({ id: messages.id, authorName: messages.authorName, body: messages.body, fileName: messages.fileName, deletedAt: messages.deletedAt })
      .from(messages)
      .where(and(eq(messages.roomId, room.id), inArray(messages.id, replyIds)));
    for (const t of targets) {
      replies.set(t.id, {
        id: t.id,
        authorName: t.authorName,
        body: t.deletedAt ? "" : t.body || (t.fileName ? `📎 ${t.fileName}` : ""),
        deleted: Boolean(t.deletedAt),
      });
    }
  }

  const [counts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      online: sql<number>`(count(*) filter (where ${roomMembers.lastSeenAt} > now() - interval '45 seconds'))::int`,
    })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, room.id), eq(roomMembers.status, "active"), isNotNull(roomMembers.nickname)));

  return {
    messages: rows.map((r) => serialize(r, viewer, replies)),
    stateVersion: room.stateVersion,
    reset,
    room: {
      id: room.id,
      name: room.name,
      description: room.description,
      isLocked: room.isLocked,
      hasPassword: Boolean(room.passwordHash),
      memberCount: counts?.total ?? 0,
      onlineCount: counts?.online ?? 0,
      e2eeEnabled: room.e2eeEnabled,
      defaultTtl: room.defaultTtl ?? null,
      ...(roomOverride ?? {}),
    },
    me: viewer,
  };
}

function serialize(r: Message, viewer: Viewer, replies: Map<number, NonNullable<ChatMessage["replyTo"]>>): ChatMessage {
  const system = r.authorRole === "system";
  const mine = !system && r.memberId !== null && r.memberId === viewer.memberId;
  return {
    id: r.id,
    body: r.body,
    authorName: r.authorName,
    authorRole: (["owner", "guest", "system"].includes(r.authorRole) ? r.authorRole : "guest") as ChatMessage["authorRole"],
    source: (["web", "telegram", "system"].includes(r.source) ? r.source : "web") as ChatMessage["source"],
    memberId: r.memberId,
    createdAt: r.createdAt.toISOString(),
    mine,
    canDelete: !system && (viewer.role === "owner" || mine),
    file:
      r.fileId && r.fileName && r.fileMime && r.fileSize !== null
        ? { id: r.fileId, name: r.fileName, mime: r.fileMime, size: r.fileSize }
        : null,
    gifId: r.gifId ?? null,
    replyTo: r.replyToId ? (replies.get(r.replyToId) ?? { id: r.replyToId, authorName: "", body: "", deleted: true }) : null,
    encrypted: r.encrypted ?? false,
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
  };
}

const g = globalThis as typeof globalThis & { __pcTouch?: Map<string, number> };
const touched: Map<string, number> = g.__pcTouch ?? (g.__pcTouch = new Map());

/** Presence heartbeat (throttled to one write per 20s per member). */
export async function touchMember(memberId: string) {
  const now = Date.now();
  if (now - (touched.get(memberId) ?? 0) < 20_000) return;
  touched.set(memberId, now);
  if (touched.size > 10_000) touched.clear();
  await db.update(roomMembers).set({ lastSeenAt: new Date() }).where(eq(roomMembers.id, memberId));
}

export function normalizeBody(input: unknown): string {
  if (typeof input !== "string") return "";
  return input.replace(/\r\n?/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();
}

export async function postMessage(
  room: Room,
  author: Viewer & { authorName: string },
  body: string,
  replyToId: number | null,
  source: "web" | "telegram",
  fileId: string | null = null,
  opts: { ttlSeconds?: number | null; encrypted?: boolean; gifId?: string } = {},
): Promise<Message> {
  // GIF id is validated by the API layer; here it is only length-capped so a
  // stray long value can never overflow the varchar(64) column.
  const gifId = typeof opts.gifId === "string" && opts.gifId ? opts.gifId.slice(0, 64) : null;
  let replyId: number | null = null;
  if (replyToId && Number.isSafeInteger(replyToId) && replyToId > 0) {
    const [target] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.id, replyToId), eq(messages.roomId, room.id)))
      .limit(1);
    replyId = target?.id ?? null;
  }

  // Attach the file only if it exists in THIS room and has not expired.
  let fileMeta: { name: string; mime: string; size: number } | null = null;
  if (fileId) {
    const [row] = await db
      .select({ name: files.name, mime: files.mime, size: files.size, expiresAt: files.expiresAt })
      .from(files)
      .where(and(eq(files.id, fileId), eq(files.roomId, room.id)))
      .limit(1);
    if (row && row.expiresAt.getTime() > Date.now()) fileMeta = row;
  }

  const [msg] = await db
    .insert(messages)
    .values({
      roomId: room.id,
      memberId: author.memberId,
      authorName: author.authorName.slice(0, 64),
      authorRole: author.role,
      source,
      body,
      replyToId: replyId,
      ...(gifId ? { gifId } : {}),
      ...(fileMeta ? { fileId, fileName: fileMeta.name, fileMime: fileMeta.mime, fileSize: fileMeta.size } : {}),
      ...(opts.ttlSeconds ? { expiresAt: new Date(Date.now() + opts.ttlSeconds * 1000) } : {}),
      ...(opts.encrypted ? { encrypted: true } : {}),
    })
    .returning();
  await db.update(rooms).set({ lastActivityAt: new Date() }).where(eq(rooms.id, room.id));
  return msg;
}

export async function softDeleteMessage(roomId: string, messageId: number, onlyMemberId?: string): Promise<boolean> {
  const conditions = [eq(messages.id, messageId), eq(messages.roomId, roomId), isNull(messages.deletedAt)];
  if (onlyMemberId) conditions.push(eq(messages.memberId, onlyMemberId));
  const deleted = await db
    .update(messages)
    .set({ deletedAt: new Date(), body: "" })
    .where(and(...conditions))
    .returning({ id: messages.id });
  if (deleted.length === 0) return false;
  await db.update(rooms).set({ stateVersion: sql`${rooms.stateVersion} + 1` }).where(eq(rooms.id, roomId));
  return true;
}
