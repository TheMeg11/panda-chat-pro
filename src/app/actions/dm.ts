"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { rooms, users } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { DM_LIMIT, findOrCreateDm } from "@/lib/rooms";
import { getSettings } from "@/lib/settings";
import type { ActionState } from "@/lib/utils";

const USERNAME_RE = /^[a-zA-Z0-9._]{2,32}$/;

/** Exact-username lookup from the chat-list search box → opens (or creates) the 1:1 chat. */
export async function startDmAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "unauthorized" };
  const settings = await getSettings();
  if (settings.maintenanceMode) return { error: "maintenance" };

  const raw = String(formData.get("username") ?? "").trim().replace(/^@+/, "");
  if (!USERNAME_RE.test(raw)) return { error: "unknownUser" };

  const [peer] = await db
    .select({ id: users.id, username: users.username, displayName: users.displayName })
    .from(users)
    .where(and(eq(users.status, "active"), sql`lower(${users.username}) = ${raw.toLowerCase()}`))
    .limit(1);
  if (!peer) return { error: "unknownUser" };
  if (peer.id === user.id) return { error: "dmSelf" };

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(rooms)
    .where(and(eq(rooms.type, "dm"), sql`(select count(*) from room_members m where m.room_id = ${rooms.id} and m.device_hash = ${`owner:${user.id}`} and m.role = 'owner') > 0`));
  if (n >= DM_LIMIT) return { error: "dmLimit" };

  const room = await findOrCreateDm(user, peer);
  revalidatePath("/dashboard");
  redirect(`/dashboard/rooms/${room.id}`);
}
