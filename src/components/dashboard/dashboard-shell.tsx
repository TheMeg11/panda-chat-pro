"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Telegram-style two-pane shell.
 *
 * Desktop  : [chat list | content] side by side.
 * Mobile   : exactly ONE pane fills the screen at a time, like Telegram:
 *            - /dashboard            → the chat list is the whole screen.
 *            - /dashboard/rooms/...  → the conversation is the whole screen.
 *            - /dashboard/settings   → the settings page is the whole screen.
 *            - /dashboard/about      → the About page is the whole screen.
 *            Nothing is ever squeezed side-by-side, and no pane may overflow
 *            horizontally (that used to cause a 72px side-scroll on phones).
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
  // The chat list owns the screen ONLY on the bare /dashboard route.
  const listPage = pathname === "/dashboard";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Platform announcement banner — above both panes so it is also
          visible on phones while browsing the chat list. */}
      {announcement ? <div className="shrink-0">{announcement}</div> : null}
      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            "min-h-0 w-full shrink-0 flex-col border-line bg-surface md:flex md:w-[350px] md:border-e xl:w-[400px]",
            listPage ? "flex" : "hidden md:flex",
          )}
        >
          {panel}
        </aside>
        <main
          className={cn(
            "min-h-0 min-w-0 flex-1 flex-col",
            listPage ? "hidden md:flex" : "flex",
          )}
        >
          <div className="min-h-0 flex-1">{children}</div>
        </main>
      </div>
    </div>
  );
}
