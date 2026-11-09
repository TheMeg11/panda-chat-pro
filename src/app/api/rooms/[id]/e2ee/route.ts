import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { e2eeKeys, roomMembers } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { getConfig } from "@/lib/config";
import { getAccessibleRoom } from "@/lib/rooms";
import { isUuid } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * E2EE key material for one conversation (session-authenticated DM only).
 * Returns MY wrapped private key (the client unwraps it with the account
 * password) and the PEER's public key. Private keys never leave the browser
 * unwrapped, and this response is never cached.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!getConfig().e2eeEnabled) return Response.json({ error: "featureDisabled" }, { status: 403 });
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (!isUuid(id)) return Response.json({ error: "gone" }, { status: 404 });

  const room = await getAccessibleRoom(user.id, id);
  if (!room || room.type !== "dm") return Response.json({ error: "gone" }, { status: 404 });

  const [mine] = await db.select().from(e2eeKeys).where(eq(e2eeKeys.userId, user.id)).limit(1);

  const [peer] = await db
    .select({ userId: roomMembers.userId })
    .from(roomMembers)
    .where(and(eq(roomMembers.roomId, room.id), eq(roomMembers.role, "owner"), ne(roomMembers.userId, user.id)))
    .limit(1);

  let peerKey: { publicKeyJwk: string; keyVersion: number } | null = null;
  if (peer?.userId) {
    const [row] = await db
      .select({ publicKeyJwk: e2eeKeys.publicKeyJwk, keyVersion: e2eeKeys.keyVersion })
      .from(e2eeKeys)
      .where(eq(e2eeKeys.userId, peer.userId))
      .limit(1);
    peerKey = row ? { publicKeyJwk: row.publicKeyJwk, keyVersion: row.keyVersion } : null;
  }

  return Response.json(
    {
      roomId: room.id,
      e2eeEnabled: room.e2eeEnabled,
      me: mine
        ? {
            publicKeyJwk: mine.publicKeyJwk,
            wrappedPrivateKey: mine.wrappedPrivateKey,
            kdfSalt: mine.kdfSalt,
            kdfIterations: mine.kdfIterations,
            keyVersion: mine.keyVersion,
          }
        : null,
      peer: peerKey,
    },
    { headers: { "cache-control": "no-store" } },
  );
}
