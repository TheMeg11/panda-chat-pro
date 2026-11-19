import type { Metadata } from "next";
import { AboutPage } from "@/components/about/about-page";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "درباره سایت — پاندا چت",
};

/**
 * «درباره سایت» — the ported standalone About page, rendered inside the
 * authenticated dashboard shell. v2.2.0: the footer's vault dialog fetches its
 * own data from the server (hidden_rooms), so no room list is passed anymore.
 */
export default async function AboutSitePage() {
  await requireUser();
  return <AboutPage />;
}
