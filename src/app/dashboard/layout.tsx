import type { ReactNode } from "react";
import { Megaphone, Wrench } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ChatListPanel } from "@/components/dashboard/chat-list";
import { HiddenRoomsBoot } from "@/components/privacy";
import { TutorialGate } from "@/components/tutorial/tutorial-gate";
import { requireUser } from "@/lib/auth";
import { HIDE_BOOT_SCRIPT } from "@/lib/vault-boot";
import { getI18n } from "@/lib/i18n-server";
import { getOnboardingState } from "@/lib/onboarding";
import { getSettings, roomLimitFor } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * Telegram-style dashboard shell.
 *
 * PRIVACY (audit §4.4 / feature §4.4): the conversation list is NOT embedded in
 * the server-rendered HTML anymore. The server cannot know which chats are
 * hidden (the vault is device-local), so ANY server-rendered list would leak
 * hidden conversation names/previews in view-source. The list now loads from
 * /api/chats (no-store) inside the browser, after the pre-paint vault rules
 * are already in place. Hidden chats still never flash.
 */
export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  const [{ t }, settings] = await Promise.all([getI18n(), getSettings()]);

  if (settings.maintenanceMode) {
    return (
      <div className="flex h-dvh flex-col">
        <script dangerouslySetInnerHTML={{ __html: HIDE_BOOT_SCRIPT }} />
        <HiddenRoomsBoot />
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
      {/* Pre-paint: hide vault rooms before the chat list renders. */}
      <script dangerouslySetInnerHTML={{ __html: HIDE_BOOT_SCRIPT }} />
      <HiddenRoomsBoot />
      <DashboardShell
        panel={
          <ChatListPanel
            chats={[]}
            user={{ displayName: user.displayName, username: user.username }}
            roomLimit={limit}
            totalRooms={0}
          />
        }
        announcement={announcement}
      >
        {children}
      </DashboardShell>
      {onboarding ? <TutorialGate state={onboarding} /> : null}
    </div>
  );
}
