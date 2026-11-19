import type { Metadata } from "next";
import { AboutPage } from "@/components/about/about-page";
import { listDashboardChats } from "@/lib/rooms";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "درباره سایت — پاندا چت",
};

/**
 * «درباره سایت» — the ported standalone About page, rendered inside the
 * authenticated dashboard shell. The server side fetches EVERY chat in the
 * user's list (owned rooms, DMs and joined rooms — v2.1.3 fix: the old
 * owned-only query made hidden DMs/joined rooms show up as "Deleted room"
 * with no way to open them from the vault), so the footer's vault dialog can
 * resolve hidden-chat names and offer a working Open button.
 */
export default async function AboutSitePage() {
  const user = await requireUser();
  const chats = await listDashboardChats(user);
  const briefs = chats.map((c) => ({ id: c.id, name: c.name, kind: c.type }));

  return <AboutPage rooms={briefs} />;
}
