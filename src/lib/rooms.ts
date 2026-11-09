import { cookies } from "next/headers";
import { and, asc, desc, eq, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { messages, roomMembers, rooms, users, type Room, type RoomMember } from "@/db/schema";
import { hashPassword, randomToken, sha256 } from "./crypto";
import { requestMeta } from "./request";
import { isUuid } from "./utils";

export const DEVICE_COOKIE = "pc_device";
const INVITE_RE = /^[A-Za-z0-9_-]{30,96}$/;

/** 256-bit random invitation token (43 URL-safe characters). */
export const newInviteToken = () => randomToken(32);

export function cleanText(value: FormDataEntryValue | null | undefined, max: number): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export async function getRoomByToken(token: string): Promise<Room | null> {
  if (!INVITE_RE.test(token)) return null;
  // Invite links are for classic rooms only — a 1:1 chat must never be joinable
  // through its (unused) invite token, even by someone who guesses it.
  const [room] = await db
    .select()
    .from(rooms)
    .where(and(eq(rooms.inviteToken, token), ne(rooms.type, "dm")))
    .limit(1);
  return room ?? null;
}

export async function getRoomById(id: string): Promise<Room | null> {
  if (!isUuid(id)) return null;
  const [room] = await db.select().from(rooms).where(eq(rooms.id, id)).limit(1);
  return room ?? null;
}

export async function getOwnedRoom(userId: string, roomId: string): Promise<Room | null> {
  if (!isUuid(roomId)) return null;
  const [room] = await db
    .select()
    .from(rooms)
    .where(and(eq(rooms.id, roomId), eq(rooms.ownerId, userId)))
    .limit(1);
  return room ?? null;
}

/* ------------------------------------------------------------------ */
/* Guest device identity (HttpOnly cookie, never readable by JS)        */
/* ------------------------------------------------------------------ */

export async function readDeviceHash(): Promise<string | null> {
  const raw = (await cookies()).get(DEVICE_COOKIE)?.value;
  if (!raw || !/^[A-Za-z0-9_-]{32,96}$/.test(raw)) return null;
  return sha256(raw);
}

/** Server Actions / Route Handlers only — may set a cookie. */
export async function ensureDeviceHash(): Promise<string> {
  const existing = await readDeviceHash();
  if (existing) return existing;
  const raw = randomToken(32);
  const meta = await requestMeta();
  (await cookies()).set(DEVICE_COOKIE, raw, {
    httpOnly: true,
    sameSite: "lax",
    secure: meta.secure,
    path: "/",
    maxAge: 365 * 86_400,
  });
  return sha256(raw);
}

export type GuestAccess =
  | { state: "password" }
  | { state: "banned" }
  | { state: "join"; member: RoomMember | null }
  | { state: "chat"; member: RoomMember };

/**
 * Decides what a visitor may see. The password check happens here, on the server,
 * before any room content (name, members, messages) is rendered or returned by the API.
 */
export async function resolveGuestAccess(room: Room, deviceHash?: string | null): Promise<GuestAccess> {
  const hash = deviceHash === undefined ? await readDeviceHash() : deviceHash;
  let member: RoomMember | null = null;
  if (hash) {
    const [found] = await db
      .select()
      .from(roomMembers)
      .where(and(eq(roomMembers.roomId, room.id), eq(roomMembers.deviceHash, hash)))
      .limit(1);
    member = found ?? null;
  }
  if (member?.status === "banned") return { state: "banned" };
  if (room.passwordHash && (!member || member.passwordVersion !== room.passwordVersion)) return { state: "password" };
  if (!member || !member.nickname) return { state: "join", member };
  return { state: "chat", member };
}

export async function getOwnerMember(room: Room, user: { id: string; displayName: string }): Promise<RoomMember> {
  const deviceHash = `owner:${user.id}`;
  const nickname = user.displayName.slice(0, 32);
  const [existing] = await db
    .select()
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, room.id), eq(roomMembers.deviceHash, deviceHash)))
    .limit(1);
  if (existing && existing.nickname === nickname) return existing;
  const [member] = await db
    .insert(roomMembers)
    .values({ roomId: room.id, deviceHash, userId: user.id, nickname, role: "owner", passwordVersion: room.passwordVersion })
    .onConflictDoUpdate({ target: [roomMembers.roomId, roomMembers.deviceHash], set: { nickname } })
    .returning();
  return member;
}

/* ------------------------------------------------------------------ */
/* Room operations shared by the dashboard, the admin panel and bots    */
/* ------------------------------------------------------------------ */

export async function addSystemMessage(roomId: string, code: string, name = "") {
  await db.insert(messages).values({
    roomId,
    authorName: (name || "system").slice(0, 64),
    authorRole: "system",
    source: "system",
    body: code,
  });
}

export async function rotateInvite(roomId: string): Promise<string> {
  const token = newInviteToken();
  await db.update(rooms).set({ inviteToken: token, updatedAt: new Date() }).where(eq(rooms.id, roomId));
  return token;
}

/** Setting, changing or removing the password forces every guest to re-verify. */
export async function setRoomPassword(roomId: string, password: string | null) {
  const passwordHash = password ? await hashPassword(password) : null;
  await db
    .update(rooms)
    .set({
      passwordHash,
      passwordVersion: sql`${rooms.passwordVersion} + 1`,
      stateVersion: sql`${rooms.stateVersion} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(rooms.id, roomId));
}

export async function setRoomLocked(roomId: string, locked: boolean) {
  await db.update(rooms).set({ isLocked: locked, updatedAt: new Date() }).where(eq(rooms.id, roomId));
  await addSystemMessage(roomId, locked ? "locked" : "unlocked");
}

export async function clearRoom(roomId: string) {
  await db.delete(messages).where(eq(messages.roomId, roomId));
  await db
    .update(rooms)
    .set({ stateVersion: sql`${rooms.stateVersion} + 1`, updatedAt: new Date() })
    .where(eq(rooms.id, roomId));
  await addSystemMessage(roomId, "cleared");
}

export async function renameRoom(roomId: string, name: string, description?: string) {
  await db
    .update(rooms)
    .set({ name, ...(description !== undefined ? { description } : {}), updatedAt: new Date() })
    .where(eq(rooms.id, roomId));
}

export async function setMemberStatus(roomId: string, memberId: string, status: "active" | "banned") {
  if (!isUuid(memberId)) return null;
  const [member] = await db
    .update(roomMembers)
    .set({ status })
    .where(and(eq(roomMembers.id, memberId), eq(roomMembers.roomId, roomId), eq(roomMembers.role, "guest")))
    .returning();
  if (member && status === "banned" && member.nickname) await addSystemMessage(roomId, "removed", member.nickname);
  return member ?? null;
}

export async function findMemberByShortId(roomId: string, short: string) {
  const clean = short.toLowerCase().replace(/[^0-9a-f]/g, "");
  if (clean.length < 4) return null;
  const [member] = await db
    .select()
    .from(roomMembers)
    .where(
      and(
        eq(roomMembers.roomId, roomId),
        eq(roomMembers.role, "guest"),
        sql`replace(${roomMembers.id}::text, '-', '') like ${clean + "%"}`,
      ),
    )
    .limit(1);
  return member ?? null;
}

export async function listMembers(roomId: string) {
  return db
    .select()
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, roomId), isNotNull(roomMembers.nickname)))
    .orderBy(asc(roomMembers.role), desc(roomMembers.lastSeenAt))
    .limit(500);
}

export async function roomCounters(roomIds: string[]) {
  const map = new Map<string, { members: number; messages: number }>();
  if (roomIds.length === 0) return map;
  for (const id of roomIds) map.set(id, { members: 0, messages: 0 });
  const memberRows = await db
    .select({ roomId: roomMembers.roomId, n: sql<number>`count(*)::int` })
    .from(roomMembers)
    .where(
      and(
        inArray(roomMembers.roomId, roomIds),
        eq(roomMembers.role, "guest"),
        eq(roomMembers.status, "active"),
        isNotNull(roomMembers.nickname),
      ),
    )
    .groupBy(roomMembers.roomId);
  const messageRows = await db
    .select({ roomId: messages.roomId, n: sql<number>`count(*)::int` })
    .from(messages)
    .where(and(inArray(messages.roomId, roomIds), isNull(messages.deletedAt), ne(messages.authorRole, "system")))
    .groupBy(messages.roomId);
  for (const r of memberRows) map.get(r.roomId)!.members = r.n;
  for (const r of messageRows) map.get(r.roomId)!.messages = r.n;
  return map;
}

/* ------------------------------------------------------------------ */
/* Private 1:1 chats ("dm")                                            */
/*                                                                     */
/* A DM is a normal room row with type="dm" whose two participants are  */
/* both "owner"-role members (device hash "owner:<userId>"). This reuses */
/* the whole message/file/telegram pipeline unchanged while keeping the */
/* chat strictly private: no invite link, no password, no guests.       */
/* ------------------------------------------------------------------ */

export const DM_LIMIT = 100;

/** Both participants of a DM are logged-in users, so the "owner:" device-hash namespace is used. */
export const dmDeviceHash = (userId: string) => `owner:${userId}`;

/** Room access for logged-in users: own rooms (any type) + DMs they participate in. */
export async function getAccessibleRoom(userId: string, roomId: string): Promise<Room | null> {
  const room = await getRoomById(roomId);
  if (!room) return null;
  if (room.ownerId === userId) return room;
  if (room.type !== "dm") return null;
  const [member] = await db
    .select({ id: roomMembers.id })
    .from(roomMembers)
    .where(
      and(
        eq(roomMembers.roomId, room.id),
        eq(roomMembers.deviceHash, dmDeviceHash(userId)),
        eq(roomMembers.role, "owner"),
      ),
    )
    .limit(1);
  return member ? room : null;
}

/** Returns the existing 1:1 chat between two users or creates it (race-safe via advisory lock). */
export async function findOrCreateDm(
  userA: { id: string; displayName: string },
  userB: { id: string; displayName: string },
): Promise<Room> {
  const hashA = dmDeviceHash(userA.id);
  const hashB = dmDeviceHash(userB.id);
  const [lo, hi] = [userA.id, userB.id].sort();
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`dm:${lo}:${hi}`}))`);
    const found = await tx.execute(sql`
      select r.* from rooms r
      where r.type = 'dm'
        and exists (select 1 from room_members m1 where m1.room_id = r.id and m1.device_hash = ${hashA} and m1.role = 'owner')
        and exists (select 1 from room_members m2 where m2.room_id = r.id and m2.device_hash = ${hashB} and m2.role = 'owner')
      limit 1`);
    const existing = (found.rows as unknown as Room[])[0];
    if (existing) return existing;
    const [room] = await tx
      .insert(rooms)
      .values({
        ownerId: userA.id,
        type: "dm",
        name: userB.displayName.slice(0, 80),
        description: "",
        inviteToken: newInviteToken(),
        passwordHash: null,
      })
      .returning();
    const nicknameA = userA.displayName.slice(0, 32);
    const nicknameB = userB.displayName.slice(0, 32);
    await tx.insert(roomMembers).values([
      { roomId: room.id, deviceHash: hashA, userId: userA.id, nickname: nicknameA, role: "owner" },
      { roomId: room.id, deviceHash: hashB, userId: userB.id, nickname: nicknameB, role: "owner" },
    ]).onConflictDoNothing();
    // In-transaction system marker (never use the global db here — the room row is not committed yet).
    await tx.insert(messages).values({
      roomId: room.id,
      authorName: "system",
      authorRole: "system",
      source: "system",
      body: "dmCreated",
    });
    return room;
  });
}

export type DashboardChat = {
  id: string;
  type: "room" | "dm";
  name: string;
  username: string | null;
  peerId: string | null;
  description: string;
  isOwner: boolean;
  hasPassword: boolean;
  isLocked: boolean;
  isDisabled: boolean;
  messagesCount: number;
  /** true when someone ELSE posted a message the viewer has not read yet */
  hasUnread: boolean;
  lastMessage: { author: string; body: string; fileName: string | null } | null;
  lastActivityAt: string;
};

/**
 * Everything the Telegram-style chat list needs — rooms owned by the user plus
 * 1:1 chats they participate in — with last-message previews. Deliberately does
 * NOT count hidden chats anywhere: the client hides vault rooms before paint.
 */
export async function listDashboardChats(user: { id: string; displayName: string }): Promise<DashboardChat[]> {
  const hash = dmDeviceHash(user.id);
  const rows = await db
    .select({ room: rooms })
    .from(rooms)
    .where(
      or(
        eq(rooms.ownerId, user.id),
        and(
          eq(rooms.type, "dm"),
          sql`exists (select 1 from room_members m where m.room_id = ${rooms.id} and m.device_hash = ${hash} and m.role = 'owner')`,
        ),
      ),
    )
    .orderBy(desc(rooms.lastActivityAt))
    .limit(400);
  if (rows.length === 0) return [];

  const roomIds = rows.map((r) => r.room.id);
  const dmRooms = rows.filter((r) => r.room.type === "dm");
  const peers = new Map<string, { id: string; username: string; displayName: string }>();
  if (dmRooms.length > 0) {
    const memberRows = await db
      .select({ roomId: roomMembers.roomId, userId: users.id, username: users.username, displayName: users.displayName })
      .from(roomMembers)
      .innerJoin(users, eq(users.id, roomMembers.userId))
      .where(
        and(
          inArray(roomMembers.roomId, dmRooms.map((r) => r.room.id)),
          eq(roomMembers.role, "owner"),
          ne(roomMembers.userId, user.id),
        ),
      );
    for (const m of memberRows) peers.set(m.roomId, { id: m.userId, username: m.username, displayName: m.displayName });
  }

  const lastRows = await db.execute(sql`
    select distinct on (room_id) room_id, author_name, body, file_name, gif_id
    from messages
    where room_id in (${sql.join(roomIds.map((id) => sql`${id}`), sql`, `)}) and deleted_at is null
    order by room_id, id desc`);
  // E2EE previews must never ship the raw `e2ee.v1.<iv>.<ct>` envelope (nor
  // file names) out of the server: the chat list and desktop notifications
  // would render ciphertext. The placeholder matches the "🔒 E2EE" badge used
  // verbatim by BOTH locales (see i18n e2ee.badge), so no new key is needed.
  const E2EE_PREVIEW = "🔒 E2EE";
  const e2eeRoomIds = new Set(rows.filter((r) => r.room.e2eeEnabled).map((r) => r.room.id));
  const lastMap = new Map<string, { author: string; body: string; fileName: string | null }>();
  for (const row of lastRows.rows as unknown as Array<{ room_id: string; author_name: string; body: string; file_name: string | null; gif_id: string | null }>) {
    // A GIF message carries no text — preview it as "GIF" (plain latin) so the
    // chat list and notification snippets show something instead of empty.
    const body = row.gif_id && !row.body ? "GIF" : row.body;
    // E2EE room, or an envelope that predates/lags the room flag → placeholder.
    if (e2eeRoomIds.has(row.room_id) || body.startsWith("e2ee.v1.")) {
      lastMap.set(row.room_id, { author: row.author_name, body: E2EE_PREVIEW, fileName: null });
      continue;
    }
    lastMap.set(row.room_id, { author: row.author_name, body, fileName: row.file_name });
  }

  // Unread flag — one query with an EXISTS subselect per room. The viewer's
  // member row always carries device_hash "owner:<userId>" (own rooms + DMs),
  // so the join covers both room types. Messages count as unread when they are
  // newer than COALESCE(last_read_at, member created_at), not deleted, not
  // self-destructed yet, and were written by someone OTHER than this member
  // (member_id differs; system events are ignored).
  const unreadRows = await db.execute(sql`
    select rm.room_id,
      exists (
        select 1 from messages m
        where m.room_id = rm.room_id
          and m.deleted_at is null
          and m.author_role <> 'system'
          and m.member_id is distinct from rm.id
          and (m.expires_at is null or m.expires_at > now())
          and m.created_at > coalesce(rm.last_read_at, rm.created_at)
      ) as has_unread
    from room_members rm
    where rm.device_hash = ${hash}
      and rm.room_id in (${sql.join(roomIds.map((id) => sql`${id}`), sql`, `)})`);
  const unreadMap = new Map<string, boolean>();
  for (const row of unreadRows.rows as unknown as Array<{ room_id: string; has_unread: boolean }>) {
    unreadMap.set(row.room_id, Boolean(row.has_unread));
  }

  const counters = await roomCounters(roomIds.filter((id) => rows.find((r) => r.room.id === id)?.room.type !== "dm"));

  return rows.map(({ room }) => {
    const peer = room.type === "dm" ? peers.get(room.id) ?? null : null;
    const c = counters.get(room.id);
    return {
      id: room.id,
      type: room.type === "dm" ? "dm" : "room",
      name: peer?.displayName ?? room.name,
      username: peer?.username ?? null,
      peerId: peer?.id ?? null,
      description: room.type === "dm" ? "" : room.description,
      isOwner: room.ownerId === user.id,
      hasPassword: Boolean(room.passwordHash),
      isLocked: room.isLocked,
      isDisabled: room.isDisabled,
      messagesCount: c?.messages ?? 0,
      hasUnread: unreadMap.get(room.id) ?? false,
      lastMessage: lastMap.get(room.id) ?? null,
      lastActivityAt: room.lastActivityAt.toISOString(),
    } satisfies DashboardChat;
  });
}
