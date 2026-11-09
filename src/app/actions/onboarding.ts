"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userOnboarding } from "@/db/schema";
import { getCurrentUser } from "@/lib/auth";
import { TUTORIAL_VERSION } from "@/lib/onboarding";
import type { ActionState } from "@/lib/utils";

/** Marks the tour finished (completed) — called by the final "Done" button. */
export async function completeTutorialAction(_prev: ActionState): Promise<ActionState> {
  void _prev;
  const user = await getCurrentUser();
  if (!user) return { error: "unauthorized" };
  await db
    .insert(userOnboarding)
    .values({ userId: user.id, tutorialVersion: TUTORIAL_VERSION, status: "completed", completedAt: new Date() })
    .onConflictDoUpdate({
      target: userOnboarding.userId,
      set: { tutorialVersion: TUTORIAL_VERSION, status: "completed", completedAt: new Date(), updatedAt: new Date() },
    });
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

/** Dismisses the tour for the current version (Skipped). */
export async function skipTutorialAction(_prev: ActionState): Promise<ActionState> {
  void _prev;
  const user = await getCurrentUser();
  if (!user) return { error: "unauthorized" };
  await db
    .insert(userOnboarding)
    .values({ userId: user.id, tutorialVersion: TUTORIAL_VERSION, status: "skipped" })
    .onConflictDoUpdate({
      target: userOnboarding.userId,
      set: { tutorialVersion: TUTORIAL_VERSION, status: "skipped", updatedAt: new Date() },
    });
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

/** Re-offers the tour from Settings ("watch the guide again"). */
export async function resetTutorialAction(_prev: ActionState): Promise<ActionState> {
  void _prev;
  const user = await getCurrentUser();
  if (!user) return { error: "unauthorized" };
  await db
    .insert(userOnboarding)
    .values({ userId: user.id, tutorialVersion: TUTORIAL_VERSION, status: "pending" })
    .onConflictDoUpdate({
      target: userOnboarding.userId,
      set: { tutorialVersion: TUTORIAL_VERSION, status: "pending", completedAt: null, updatedAt: new Date() },
    });
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "tutorial.restarted" };
}
