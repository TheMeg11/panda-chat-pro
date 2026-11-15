import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { rooms } from "@/db/schema";
import { AboutPage } from "@/components/about/about-page";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "درباره سایت — پاندا چت",
};

/**
 * «درباره سایت» — the ported standalone About page, rendered inside the
 * authenticated dashboard shell. The server side only fetches the rooms the
 * user owns (same query the settings page uses) so the footer's vault dialog
 * can resolve hidden-chat names.
 */
export default async function AboutSitePage() {
  const user = await requireUser();
  const ownedRooms = await db.select({ id: rooms.id, name: rooms.name }).from(rooms).where(eq(rooms.ownerId, user.id));

  return <AboutPage rooms={ownedRooms} />;
}
