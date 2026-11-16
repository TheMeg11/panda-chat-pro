import { Megaphone } from "lucide-react";
import LandingShell from "@/components/landing-shell";
import { getCurrentUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n-server";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const [{ lang }, user, settings] = await Promise.all([getI18n(), getCurrentUser(), getSettings()]);

  return (
    <>
      {settings.announcement ? (
        <div className="relative z-50 border-b border-line bg-accent-soft px-5 py-2.5 text-center text-sm font-semibold text-accent-ink">
          <Megaphone className="me-2 inline size-4 align-[-3px]" />
          {settings.announcement}
        </div>
      ) : null}
      <LandingShell user={user ? { name: user.username } : null} lang={lang} />
    </>
  );
}
