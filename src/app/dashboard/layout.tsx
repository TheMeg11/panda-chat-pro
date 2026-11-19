import type { ReactNode } from "react";
import { Megaphone, Wrench } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ChatListPanel } from "@/components/dashboard/chat-list";
import { NotifyManager } from "@/components/notify-manager";
import { TutorialGate } from "@/components/tutorial/tutorial-gate";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n-server";
import { getOnboardingState } from "@/lib/onboarding";
import { getSettings, roomLimitFor } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * Telegram-style dashboard shell.
 *
 * PRIVACY (audit §4.4 / feature §4.4): the conversation list loads client-side
 * from /api/chats (no-store) for live sync. v2.2.0: hidden chats are excluded
 * SERVER-side (hidden_rooms), so neither the API payload nor any server HTML
 * can leak them — no pre-paint hiding needed anymore.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const [{ t }, settings] = await Promise.all([getI18n(), getSettings()]);

  if (settings.maintenanceMode) {
    return (
      <div className="flex h-dvh flex-col">
        <div className="grid h-full place-items-center px-6 py-16">
          <div className="card max-w-md p-8 text-center">
            <span className="icon-tile mx-auto bg-amber-soft text-amber-ink">
              <Wrench className="size-5" />
            </span>
            <h1 className="mt-4 text-xl font-extrabold text-ink">{t.common.maintenanceTitle}</h1>
            <p className="mt-2 text-sm text-muted">{t.common.maintenanceText}</p>
          </div>
        </div>
      </div>
    );
  }

  const onboarding = await getOnboardingState();
  const limit = roomLimitFor(user, settings);

  const announcement = settings.announcement ? (
    <div className="shrink-0 border-b border-line bg-accent-soft px-4 py-2 text-center text-sm font-semibold text-accent-ink">
      <Megaphone className="me-2 inline size-4 align-[-3px]" />
      {settings.announcement}
    </div>
  ) : null;

  return (
    <div className="flex h-dvh flex-col">
      <DashboardShell
        panel={
          <ChatListPanel
            chats={[]}
            user={{
              displayName: user.displayName,
              username: user.username,
              id: user.id,
              bio: user.bio,
              // 1 = avatar exists; clients append ?v=<avatarVersion> to bust caches
              avatarVersion: user.avatarVersion,
            }}
            roomLimit={limit}
            totalRooms={0}
          />
        }
        announcement={announcement}
      >
        {children}
      </DashboardShell>
      {onboarding ? <TutorialGate state={onboarding} /> : null}
      {/* Client-side notification runtime: polls /api/chats for unread flips. */}
      <NotifyManager />
    </div>
  );
}
