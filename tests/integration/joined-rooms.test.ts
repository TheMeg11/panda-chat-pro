import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../../src/db";
import { messages, roomMembers, rooms, users } from "../../src/db/schema";
import { getAccessibleRoom, getEffectiveMember, listDashboardChats } from "../../src/lib/rooms";
import { postMessage, buildSnapshot } from "../../src/lib/chat";
import { randomToken } from "../../src/lib/crypto";

// getBaseUrl falls back to request headers (unavailable outside a request
// scope) — pin it for these tests the way production resolves it via publicUrl.
vi.mock("../../src/lib/request", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/request")>();
  return { ...actual, getBaseUrl: async () => "https://chat.kanar.ir" };
});

/**
 * v1.6.0 joined-rooms integration — runs against a REAL Postgres
 * (DATABASE_URL; skipped when absent, exactly like db.test.ts).
 *
 * The world: A owns a room and posts; B registered an account and JOINED the
 * room through the invite (a guest-role member row linked to B's account).
 */
const hasDb = Boolean(process.env.DATABASE_URL && /^postgres(ql)?:\/\//.test(process.env.DATABASE_URL));

describe.skipIf(!hasDb)("joined rooms in the dashboard (v1.6.0)", () => {
  const suffix = randomToken(4).replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
  let ownerId = "";
  let joinerId = "";
  let strangerId = "";
  let roomId = "";
  let memberIdB = "";

  beforeAll(async () => {
    const [a] = await db
      .insert(users)
      .values({ username: `own_${suffix}`, displayName: "Owner A", passwordHash: "x" })
      .returning();
    const [b] = await db
      .insert(users)
      .values({ username: `jnd_${suffix}`, displayName: "Joiner B", passwordHash: "x" })
      .returning();
    const [c] = await db
      .insert(users)
      .values({ username: `stg_${suffix}`, displayName: "Stranger C", passwordHash: "x" })
      .returning();
    ownerId = a.id;
    joinerId = b.id;
    strangerId = c.id;

    const [room] = await db
      .insert(rooms)
      .values({ ownerId, name: `Joined Room ${suffix}`, description: "", inviteToken: randomToken(32) })
      .returning();
    roomId = room.id;

    // A's owner row (exactly what getOwnerMember creates) + B's guest row
    // (exactly what joinRoomAction creates for a logged-in user).
    await db.insert(roomMembers).values([
      { roomId, deviceHash: `owner:${ownerId}`, userId: ownerId, nickname: "Owner A", role: "owner", passwordVersion: 0 },
      { roomId, deviceHash: randomToken(32), userId: joinerId, nickname: "B Tester", role: "guest", passwordVersion: 0 },
    ]);
    const [mb] = await db
      .select()
      .from(roomMembers)
      .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.userId, joinerId)))
      .limit(1);
    memberIdB = mb.id;
  });

  afterAll(async () => {
    await db.delete(messages).where(eq(messages.roomId, roomId));
    await db.delete(roomMembers).where(eq(roomMembers.roomId, roomId));
    await db.delete(rooms).where(eq(rooms.id, roomId));
    for (const id of [ownerId, joinerId, strangerId]) {
      if (id) await db.delete(users).where(eq(users.id, id));
    }
  });

  it("the JOINED room appears in the joiner's dashboard list", async () => {
    const b = { id: joinerId, displayName: "Joiner B" };
    const chats = await listDashboardChats(b);
    const joined = chats.find((c) => c.id === roomId);
    expect(joined, "joined room must be listed for B").toBeTruthy();
    expect(joined!.isOwner).toBe(false);
    expect(joined!.inviteUrl).toBeNull(); // the invite token must never leak to a non-owner
    expect(joined!.name).toBe(`Joined Room ${suffix}`);
  });

  it("the owner sees the room with its invite url; a stranger sees nothing", async () => {
    const chats = await listDashboardChats({ id: ownerId, displayName: "Owner A" });
    const mine = chats.find((c) => c.id === roomId);
    expect(mine).toBeTruthy();
    expect(mine!.isOwner).toBe(true);
    expect(mine!.inviteUrl).toContain("/r/");

    const strangerChats = await listDashboardChats({ id: strangerId, displayName: "Stranger C" });
    expect(strangerChats.find((c) => c.id === roomId)).toBeUndefined();
  });

  it("the joiner can open the room (access) and keeps the guest identity", async () => {
    const room = await getAccessibleRoom(joinerId, roomId);
    expect(room).toBeTruthy();
    const member = await getEffectiveMember(room!, { id: joinerId, displayName: "Joiner B" });
    expect(member.id).toBe(memberIdB);
    expect(member.role).toBe("guest");
    expect(member.nickname).toBe("B Tester");
  });

  it("a stranger still cannot open the joined room", async () => {
    expect(await getAccessibleRoom(strangerId, roomId)).toBeNull();
  });

  it("the joiner receives the owner's message and unread flags behave", async () => {
    const room = (await getAccessibleRoom(joinerId, roomId))!;
    const ownerMember = await getEffectiveMember(room, { id: ownerId, displayName: "Owner A" });
    const viewerB = { memberId: memberIdB, nickname: "B Tester", role: "guest" as const, markRead: true };

    const msg = await postMessage(room, { memberId: ownerMember.id, nickname: "Owner A", role: "owner", authorName: "Owner A" }, "hello joiner", null, "web");
    const snap = await buildSnapshot(room, viewerB, 0, null);
    expect(snap.messages.some((m) => m.id === msg.id && m.body === "hello joiner")).toBe(true);

    // unread ON for B before read-marking, OFF after (markRead rides on chatGet)
    let chats = await listDashboardChats({ id: joinerId, displayName: "Joiner B" });
    expect(chats.find((c) => c.id === roomId)!.hasUnread).toBe(true);
    await db.update(roomMembers).set({ lastReadAt: new Date() }).where(eq(roomMembers.id, memberIdB));
    chats = await listDashboardChats({ id: joinerId, displayName: "Joiner B" });
    expect(chats.find((c) => c.id === roomId)!.hasUnread).toBe(false);
  });

  it("banned membership removes the room from the list and blocks access", async () => {
    await db.update(roomMembers).set({ status: "banned" }).where(eq(roomMembers.id, memberIdB));
    const chats = await listDashboardChats({ id: joinerId, displayName: "Joiner B" });
    expect(chats.find((c) => c.id === roomId)).toBeUndefined();
    expect(await getAccessibleRoom(joinerId, roomId)).toBeNull();
  });
});
