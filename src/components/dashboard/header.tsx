"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut, MessagesSquare, UserRound } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { Avatar, Logo } from "@/components/brand";
import { useI18n } from "@/components/i18n-provider";
import { LangToggle, ThemeToggle } from "@/components/ui";
import { cn } from "@/lib/utils";

export function DashboardHeader({ displayName, username }: { displayName: string; username: string }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const inRoom = pathname.startsWith("/dashboard/rooms/");
  const nav = [
    { href: "/dashboard", label: t.common.rooms, icon: MessagesSquare, active: pathname === "/dashboard" || inRoom },
    { href: "/dashboard/settings", label: t.common.account, icon: UserRound, active: pathname.startsWith("/dashboard/settings") },
  ];
  const links = nav.map((item) => (
    <Link key={item.href} href={item.href} className={cn("btn btn-sm h-9", item.active ? "btn-soft" : "btn-ghost")}>
      <item.icon className="size-4" />
      {item.label}
    </Link>
  ));
  return (
    <header className="glass relative z-30 shrink-0 border-b border-line/80">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:px-6">
        <Logo href="/dashboard" size={32} />
        <nav className="ms-5 hidden items-center gap-1 sm:flex">{links}</nav>
        <div className="ms-auto flex items-center gap-0.5">
          <LangToggle compact />
          <ThemeToggle />
          <div className="ms-2 hidden items-center gap-2.5 border-s border-line ps-3 md:flex">
            <Avatar name={displayName} size={32} />
            <div className="leading-tight">
              <p className="max-w-40 truncate text-sm font-bold text-ink">{displayName}</p>
              <p className="text-[11px] text-muted" dir="ltr">
                @{username}
              </p>
            </div>
          </div>
          <form action={logoutAction}>
            <button type="submit" className="btn btn-ghost btn-icon" title={t.common.logout} aria-label={t.common.logout}>
              <LogOut className="size-[18px] rtl:-scale-x-100" />
            </button>
          </form>
        </div>
      </div>
      {!inRoom ? <nav className="flex gap-1 px-4 pb-2.5 sm:hidden">{links}</nav> : null}
    </header>
  );
}
