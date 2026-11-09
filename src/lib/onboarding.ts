import { eq } from "drizzle-orm";
import { db } from "@/db";
import { userOnboarding } from "@/db/schema";
import { getCurrentUser } from "./auth";
import { getConfig } from "./config";

/** Current tutorial content version — bump when steps change to re-offer the tour. */
export const TUTORIAL_VERSION = 1;

export type OnboardingState = {
  status: "pending" | "completed" | "skipped";
  tutorialVersion: number;
  /** true when the user saw an older tutorial and may want the update tour */
  outdated: boolean;
};

/** Reads the tutorial state for the logged-in user (pending when never seen). */
export async function getOnboardingState(): Promise<OnboardingState | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!getConfig().tutorialEnabled) return null;

  const [row] = await db.select().from(userOnboarding).where(eq(userOnboarding.userId, user.id)).limit(1);
  if (!row) {
    // Lazily materialize the "pending" row so the tour shows exactly once.
    await db
      .insert(userOnboarding)
      .values({ userId: user.id, tutorialVersion: TUTORIAL_VERSION, status: "pending" })
      .onConflictDoNothing();
    return { status: "pending", tutorialVersion: TUTORIAL_VERSION, outdated: false };
  }
  return {
    status: (["pending", "completed", "skipped"].includes(row.status) ? row.status : "pending") as OnboardingState["status"],
    tutorialVersion: row.tutorialVersion,
    outdated: row.tutorialVersion < TUTORIAL_VERSION,
  };
}
