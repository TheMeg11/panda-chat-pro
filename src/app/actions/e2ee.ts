"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { e2eeKeys, messages, rooms } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { getAccessibleRoom } from "@/lib/rooms";
import { getConfig } from "@/lib/config";
import { isUuid } from "@/lib/utils";
import type { ActionState } from "@/lib/utils";

/**
 * E2EE server actions.
 *
 * The server's ONLY jobs: store public keys, store password-wrapped private
 * keys (it cannot open them), and flip the per-conversation E2EE flag after
 * verifying BOTH participants published a key. Everything cryptographic
 * happens in the browser (src/lib/e2ee-client.ts).
 */

const ALLOWED_TTLS = [null, 3600, 86_400, 7 * 86_400] as const;

export async function publishE2eeKeyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  void _prev;
  const user = await getCurrentUser();
  if (!user) return { error: "unauthorized" };
  if (!getConfig().e2eeEnabled) return { error: "featureDisabled" };
  if (!rateLimit(`e2ee-key:${user.id}`, 4, 10 * 60_000).ok) return { error: "rateLimited" };

  const publicKeyJwk = String(formData.get("publicKeyJwk") ?? "");
  const wrappedPrivateKey = String(formData.get("wrappedPrivateKey") ?? "");
  const kdfSalt = String(formData.get("kdfSalt") ?? "");
  const kdfIterations = Number(formData.get("kdfIterations") ?? 0);

  // Strict shape validation — only P-256 ECDH public keys with no private material.
  let jwk: JsonWebKey;
  try {
    jwk = JSON.parse(publicKeyJwk) as JsonWebKey;
  } catch {
    return { error: "e2eeInvalidKey" };
  }
  if (jwk.kty !== "EC" || jwk.crv !== "P-256" || !jwk.x || !jwk.y || jwk.d) return { error: "e2eeInvalidKey" };
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(wrappedPrivateKey)) return { error: "e2eeInvalidKey" };
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(kdfSalt)) return { error: "e2eeInvalidKey" };
  const iterations = Number.isSafeInteger(kdfIterations) && kdfIterations >= 100_000 ? Math.min(kdfIterations, 2_000_000) : 310_000;

  await db
    .insert(e2eeKeys)
    .values({
      userId: user.id,
      publicKeyJwk: publicKeyJwk.slice(0, 2048),
      wrappedPrivateKey: wrappedPrivateKey.slice(0, 4096),
      kdfSalt,
      kdfIterations: iterations,
      keyVersion: 1,
    })
    .onConflictDoUpdate({
      target: e2eeKeys.userId,
      set: {
        publicKeyJwk: publicKeyJwk.slice(0, 2048),
        wrappedPrivateKey: wrappedPrivateKey.slice(0, 4096),
        kdfSalt,
        kdfIterations: iterations,
        updatedAt: new Date(),
      },
    });
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "e2ee.keyPublished" };
}

/**
 * Enables/disables E2EE for a DIRECT conversation. Requires both participants
 * to have published a keypair. The flag only affects NEW messages — history
 * stays exactly as it was (no fake "retroactive encryption").
 */
export async function setRoomE2eeAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "unauthorized" };
  if (!getConfig().e2eeEnabled) return { error: "featureDisabled" };
  const roomId = String(formData.get("roomId") ?? "");
  const enable = String(formData.get("enable") ?? "") === "true";
  if (!isUuid(roomId)) return { error: "notFound" };

  const access = await getAccessibleRoom(user.id, roomId);
  if (!access || access.type !== "dm") return { error: "notFound" };

  if (enable) {
    // Both DM participants must have a published key.
    const memberUsers = await db.execute<{ user_id: string }>(
      sql`select distinct user_id from room_members where room_id = ${roomId} and user_id is not null`,
    );
    const userIds = ((memberUsers.rows ?? []) as Array<{ user_id: string }>).map((r) => r.user_id);
    if (userIds.length < 2) return { error: "e2eePeerNotReady" };
    const withKeys = await db
      .select({ userId: e2eeKeys.userId })
      .from(e2eeKeys)
      .where(sql`${e2eeKeys.userId} in (${sql.join(userIds.map((id) => sql`${id}::uuid`), sql`, `)})`);
    if (withKeys.length < 2) return { error: "e2eePeerNotReady" };
  }

  await db
    .update(rooms)
    .set({ e2eeEnabled: enable, stateVersion: sql`${rooms.stateVersion} + 1`, updatedAt: new Date() })
    .where(eq(rooms.id, roomId));
  revalidatePath(`/dashboard/rooms/${roomId}`);
  return { ok: true, message: enable ? "e2ee.enabled" : "e2ee.disabled" };
}

/** Sets the default self-destruct TTL for a conversation (off / 1h / 24h / 7d). */
export async function setRoomTtlAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "unauthorized" };
  const roomId = String(formData.get("roomId") ?? "");
  const raw = String(formData.get("ttl") ?? "");
  if (!isUuid(roomId)) return { error: "notFound" };

  const access = await getAccessibleRoom(user.id, roomId);
  if (!access) return { error: "notFound" };

  const ttl = raw === "" || raw === "off" || raw === "null" ? null : Number(raw);
  if (ttl !== null && !(ALLOWED_TTLS as readonly (number | null)[]).includes(ttl)) return { error: "badRequest" };

  await db
    .update(rooms)
    .set({ defaultTtl: ttl, stateVersion: sql`${rooms.stateVersion} + 1`, updatedAt: new Date() })
    .where(eq(rooms.id, roomId));
  revalidatePath(`/dashboard/rooms/${roomId}`);
  return { ok: true, message: "ttl.updated" };
}

/** Verify a room really contains only envelopes once E2EE is on (integrity check). */
export async function verifyRoomE2eeIntegrity(roomId: string): Promise<{ plaintextCount: number }> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(messages)
    .where(and(eq(messages.roomId, roomId), eq(messages.encrypted, false), sql`${messages.body} like 'e2ee.v1.%'`));
  return { plaintextCount: row?.n ?? 0 };
}
