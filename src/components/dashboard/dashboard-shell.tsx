"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * v2.0 theme shell — deep-navy icon rail / sidebar (md+) with the chat list
 * living INSIDE the sidebar (like the theme's Sidebar + ChatList), plus a
 * bottom tab bar on phones. The main pane fills the rest.
 *
 * Desktop  : [sidebar (nav + chat list) | content]
 * Mobile   : [content fills the screen] + bottom nav (chats / settings / profile).
 * The chat list owns the mobile screen ONLY on the bare /dashboard route.
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
  const inSettings = pathname.startsWith("/dashboard/settings");
  const inAbout = pathname.startsWith("/dashboard/about");

  // The mobile bottom nav must never cover the list's own FAB zone or the
  // settings page footer; it hides on conversation pages entirely.
  const showBottomNav = listPage || inSettings || inAbout;

  useEffect(() => {
    document.documentElement.style.setProperty("--dash-bottom-nav", showBottomNav ? "4.75rem" : "0px");
    return () => document.documentElement.style.setProperty("--dash-bottom-nav", "0px");
  }, [showBottomNav]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Platform announcement banner — above both panes so it is also
          visible on phones while browsing the chat list. */}
      {announcement ? <div className="shrink-0">{announcement}</div> : null}
      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            "min-h-0 w-full shrink-0 flex-col bg-surface md:flex md:w-[350px] md:border-e md:border-line lg:w-[400px]",
            listPage ? "flex" : "hidden md:flex",
          )}
        >
          {panel}
        </aside>
        <main
          className={cn(
            "min-h-0 min-w-0 flex-1 flex-col bg-canvas",
            listPage ? "hidden md:flex" : "flex",
          )}
        >
          <div className="min-h-0 flex-1">{children}</div>
        </main>
      </div>
      {/* Mobile spacer so content can scroll clear of the fixed bottom nav */}
      {showBottomNav ? <div className="h-[4.75rem] shrink-0 md:hidden" aria-hidden="true" /> : null}
    </div>
  );
}
