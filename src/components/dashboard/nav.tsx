"use client";

import { LogOut, MessagesSquare, Settings, UserRound, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { logoutAction } from "@/app/actions/auth";
import { Avatar, Logo } from "@/components/brand";
import { useI18n } from "@/components/i18n-provider";
import { tr } from "@/lib/i18n";
import { APP_VERSION } from "@/lib/version";
import { cn } from "@/lib/utils";

export type NavTab = "chats" | "settings" | "profile";

/**
 * v2.0 theme navigation.
 *
 * PRIVACY: there is NO "hidden chats" entry — the vault is reachable ONLY via
 * Settings → About → five taps on the version number. The nav carries exactly
 * three destinations on every breakpoint: Chats, Settings, Profile.
 */
export const NAV_ITEMS: Array<{ key: NavTab; href: string; icon: LucideIcon; labelPath: string }> = [
  { key: "chats", href: "/dashboard", icon: MessagesSquare, labelPath: "common.rooms" },
  { key: "settings", href: "/dashboard/settings", icon: Settings, labelPath: "common.account" },
  { key: "profile", href: "/dashboard/profile", icon: UserRound, labelPath: "common.profile" },
];

/** Desktop sidebar header (icon rail on md, full width on lg) — deep navy. */
export function SidebarHeader() {
  const { t } = useI18n();
  return (
    <div className="bg-side px-3 pb-4 pt-[calc(env(safe-area-inset-top)+1rem)] text-white md:px-4 lg:px-5">
      <div className="flex items-center justify-between">
        <Logo href="/dashboard" size={34} onDark />
        <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/70" dir="ltr">
          v{APP_VERSION.split(".").slice(0, 2).join(".")}
        </span>
      </div>
      <p className="mt-1 hidden ps-1 text-[11px] font-medium text-white/50 lg:block">{t.common.dashboard}</p>
    </div>
  );
}

/** Mobile bottom tab bar (theme's BottomNav) — no hidden-chats entry.
 * v2.4.1 — the Profile tab shows the account's avatar PHOTO (main-page
 * visibility on phones; initials fallback when no picture is set). */
export function BottomNav({
  unread = 0,
  user,
}: {
  unread?: number;
  user?: { id: string; displayName: string; avatarVersion: number };
}) {
  const { t } = useI18n();
  const pathname = usePathname();
  return (
    <nav
      aria-label={t.common.dashboard}
      className="fixed inset-x-0 bottom-0 z-30 flex h-[4.75rem] items-stretch border-t border-line bg-surface/95 pt-1 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 0.35rem)" }}
    >
      {NAV_ITEMS.map((item) => {
        const active =
          item.key === "chats"
            ? pathname === "/dashboard" || (pathname.startsWith("/dashboard/rooms") && !pathname.startsWith("/dashboard/rooms/"))
            : pathname.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-2xl text-[11px] font-semibold transition",
              active ? "text-accent-ink" : "text-muted hover:text-ink",
            )}
          >
            <span className="relative">
              {item.key === "profile" && user ? (
                <Avatar
                  name={user.displayName}
                  size={22}
                  src={user.avatarVersion > 0 ? `/api/users/${user.id}/avatar?v=${user.avatarVersion}` : undefined}
                />
              ) : (
                <Icon className="size-[22px]" aria-hidden="true" />
              )}
              {item.key === "chats" && unread > 0 ? (
                <span className="absolute -end-2 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-ink px-1 text-[10px] font-bold text-white">
                  {unread > 99 ? "99+" : unread}
                </span>
              ) : null}
            </span>
            {tr(t, item.labelPath)}
          </Link>
        );
      })}
    </nav>
  );
}
