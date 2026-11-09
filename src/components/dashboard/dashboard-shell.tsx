"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Telegram-style two-pane shell.
 *
 * Desktop  : [chat list | content] side by side.
 * Mobile   : the list fills the screen on /dashboard; opening a conversation
 *            slides the content pane in and hides the list (like Telegram).
 */
export function DashboardShell({
  panel,
  announcement,
  children,
}: {
  panel: ReactNode;
  announcement?: ReactNode;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const inConversation = /^\/dashboard\/rooms\/[^/]+/.test(pathname);
  return (
    <div className="flex min-h-0 flex-1">
      <aside
        className={cn(
          "min-h-0 w-full shrink-0 flex-col border-line bg-surface md:flex md:w-[350px] md:border-e xl:w-[400px]",
          inConversation ? "hidden" : "flex",
        )}
      >
        {panel}
      </aside>
      <main className="flex min-h-0 min-w-0 flex-1 flex-col">
        {announcement}
        <div className="min-h-0 flex-1">{children}</div>
      </main>
    </div>
  );
}
