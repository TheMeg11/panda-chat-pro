import type { Metadata } from "next";
import { PandaMark } from "@/components/brand";
import { getI18n } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

/**
 * The dashboard is the Telegram-style chat list living in the layout — this pane
 * only shows the desktop "select a conversation" placeholder. No stats, no
 * counters, no greeting: anything that could hint at hidden chats is absent.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.dash.title };
}

export default async function DashboardPage() {
  const { t } = await getI18n();
  return (
    <div className="grid h-full place-items-center px-6 py-16">
      <div className="text-center">
        <PandaMark size={72} className="float-slow" />
        <p className="mt-6 font-extrabold text-ink">{t.dm.selectChatTitle}</p>
        <p className="mt-1.5 text-sm text-muted">{t.dm.selectChatText}</p>
      </div>
    </div>
  );
}
