import type { ReactNode } from "react";
import { Megaphone, Wrench } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ChatListPanel } from "@/components/dashboard/chat-list";
import { HiddenRoomsBoot } from "@/components/privacy";
import { requireUser } from "@/lib/auth";
import { HIDE_BOOT_SCRIPT } from "@/lib/vault-boot";
import { getI18n } from "@/lib/i18n-server";
import { listDashboardChats } from "@/lib/rooms";
import { getSettings, roomLimitFor } from "@/lib/settings";

export const dynamic = "force-dynamic";

/**
 * Telegram-style dashboard shell. The layout loads every conversation (rooms +
 * 1:1 chats) ONCE and renders the chat list beside/near the active pane.
 *
 * Hidden chats never reach this component's output in any count, badge or
 * statistic — they are only ever filtered out client-side, before first paint.
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

  const chats = await listDashboardChats(user);
  const totalRooms = chats.filter((c) => c.type === "room" && c.isOwner).length;
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
            chats={chats}
            user={{ displayName: user.displayName, username: user.username }}
            roomLimit={limit}
            totalRooms={totalRooms}
          />
        }
        announcement={announcement}
      >
        {children}
      </DashboardShell>
    </div>
  );
}
