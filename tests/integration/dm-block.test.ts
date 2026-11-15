import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "../../src/db";
import { messages, roomMembers, rooms, userBlocks, users } from "../../src/db/schema";
import { findOrCreateDm } from "../../src/lib/rooms";
import { BlockedDmError, postMessage } from "../../src/lib/chat";
import { randomToken } from "../../src/lib/crypto";

/**
 * v1.7.0 DM block integration — a REAL Postgres is required (DATABASE_URL).
 * Block semantics: blocking freezes the 1:1 conversation in BOTH directions
 * (the send path checks a block row between the two participants), while
 * history stays readable and unblock restores sending.
 */
const hasDb = Boolean(process.env.DATABASE_URL && /^postgres(ql)?:\/\//.test(process.env.DATABASE_URL));

describe.skipIf(!hasDb)("dm blocking (v1.7.0)", () => {
  const suffix = randomToken(4).replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
  let alice = "";
  let bob = "";
  let dmRoom = "";

  beforeAll(async () => {
    const [a] = await db
      .insert(users)
      .values({ username: `blk_${suffix}`, displayName: "Alice", passwordHash: "x" })
      .returning();
    const [b] = await db
      .insert(users)
      .values({ username: `bee_${suffix}`, displayName: "Bob", passwordHash: "x" })
      .returning();
    alice = a.id;
    bob = b.id;
    const room = await findOrCreateDm({ id: alice, displayName: "Alice" }, { id: bob, displayName: "Bob" });
    dmRoom = room.id;
  });

  afterAll(async () => {
    await db.delete(messages).where(eq(messages.roomId, dmRoom));
    await db.delete(roomMembers).where(eq(roomMembers.roomId, dmRoom));
    await db.delete(rooms).where(eq(rooms.id, dmRoom));
    await db.delete(userBlocks).where(eq(userBlocks.blockerId, alice));
    for (const id of [alice, bob]) {
      if (id) await db.delete(users).where(eq(users.id, id));
    }
  });

  it("both DM participants have owner-role rows and can post before a block", async () => {
    const members = await db.select().from(roomMembers).where(eq(roomMembers.roomId, dmRoom));
    expect(members).toHaveLength(2);
    expect(members.every((m) => m.role === "owner")).toBe(true);
    const room = (await db.select().from(rooms).where(eq(rooms.id, dmRoom)).limit(1))[0];
    const post = (memberId: string, name: string) =>
      postMessage(room, { memberId, nickname: name, role: "owner", authorName: name }, "hello", null, "web");
    await post(members.find((m) => m.userId === alice)!.id, "Alice");
    await post(members.find((m) => m.userId === bob)!.id, "Bob");
  });

  it("a block row exists for exactly the blocker→blocked pair", async () => {
    await db.insert(userBlocks).values({ blockerId: alice, blockedId: bob }).onConflictDoNothing();
    const rows = await db.select().from(userBlocks).where(eq(userBlocks.blockerId, alice));
    expect(rows).toHaveLength(1);
    expect(rows[0].blockedId).toBe(bob);
    // onConflictDoNothing keeps it idempotent
    await expect(
      db.transaction(async (tx) => {
        await tx.insert(userBlocks).values({ blockerId: alice, blockedId: bob }).onConflictDoNothing();
      }),
    ).resolves.toBeUndefined();
  });

  it("a block row freezes posting in BOTH directions until the row is gone", async () => {
    const members = await db.select().from(roomMembers).where(eq(roomMembers.roomId, dmRoom));
    const room = (await db.select().from(rooms).where(eq(rooms.id, dmRoom)).limit(1))[0];
    const post = (memberId: string, name: string) =>
      postMessage(room, { memberId, nickname: name, role: "owner", authorName: name }, "hello again", null, "web");
    // the row inserted by the previous test freezes the conversation both ways
    await db.insert(userBlocks).values({ blockerId: alice, blockedId: bob }).onConflictDoNothing();
    await expect(post(members.find((m) => m.userId === alice)!.id, "Alice")).rejects.toBeInstanceOf(BlockedDmError);
    await expect(post(members.find((m) => m.userId === bob)!.id, "Bob")).rejects.toBeInstanceOf(BlockedDmError);
    // the reverse pair freezes too — either side alone can stop the exchange
    await db.insert(userBlocks).values({ blockerId: bob, blockedId: alice }).onConflictDoNothing();
    await expect(post(members.find((m) => m.userId === alice)!.id, "Alice")).rejects.toBeInstanceOf(BlockedDmError);
    // clearing every row restores sending for both participants
    await db.delete(userBlocks);
    await expect(post(members.find((m) => m.userId === alice)!.id, "Alice")).resolves.toHaveProperty("id");
    await expect(post(members.find((m) => m.userId === bob)!.id, "Bob")).resolves.toHaveProperty("id");
  });

  it("unblock removes the row and restores a clean slate", async () => {
    await db.delete(userBlocks).where(and(eq(userBlocks.blockerId, alice), eq(userBlocks.blockedId, bob)));
    const rows = await db.select().from(userBlocks).where(eq(userBlocks.blockerId, alice));
    expect(rows).toHaveLength(0);
  });
});
