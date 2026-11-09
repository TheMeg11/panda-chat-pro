"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { DatabaseBackup, LayoutDashboard, LogOut, MessagesSquare, Send, ServerCog, ShieldCheck, SlidersHorizontal, Users } from "lucide-react";
import { adminLoginAction, adminLogoutAction } from "@/app/actions/admin";
import { Logo } from "@/components/brand";
import { useI18n } from "@/components/i18n-provider";
import { ActionForm, LangToggle, PasswordInput, SubmitButton, ThemeToggle } from "@/components/ui";
import { cn } from "@/lib/utils";

export function AdminShell({ base, children }: { base: string; children: ReactNode }) {
  const pathname = usePathname();
  const { t } = useI18n();
  const items: Array<{ href: string; icon: LucideIcon; label: string; exact?: boolean }> = [
    { href: base, icon: LayoutDashboard, label: t.admin.navOverview, exact: true },
    { href: `${base}/users`, icon: Users, label: t.admin.navUsers },
    { href: `${base}/rooms`, icon: MessagesSquare, label: t.admin.navRooms },
    { href: `${base}/telegram`, icon: Send, label: t.admin.navTelegram },
    { href: `${base}/backup`, icon: DatabaseBackup, label: t.admin.navBackup },
    { href: `${base}/settings`, icon: SlidersHorizontal, label: t.admin.navPlatform },
    { href: `${base}/system`, icon: ServerCog, label: t.admin.navSystem },
  ];
  const isActive = (href: string, exact?: boolean) => (exact ? pathname === href : pathname.startsWith(href));
  const logout = (
    <form action={adminLogoutAction}>
      <button type="submit" className="btn btn-ghost btn-sm">
        <LogOut className="size-4 rtl:-scale-x-100" />
        {t.admin.signOut}
      </button>
    </form>
  );

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-e border-line bg-surface lg:flex">
        <div className="px-5 py-5">
          <Logo href={base} size={34} subtitle={t.admin.title} />
        </div>
        <nav className="flex-1 space-y-1 px-3 py-2">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-bold transition",
                isActive(item.href, item.exact) ? "bg-accent-soft text-accent-ink" : "text-ink-2 hover:bg-surface-3 hover:text-ink",
              )}
            >
              <item.icon className="size-[18px]" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="m-3 rounded-xl border border-line bg-surface-2 p-3">
          <p className="flex items-center gap-1.5 text-xs font-bold text-mint-ink">
            <ShieldCheck className="size-3.5" />
            {t.admin.console}
          </p>
          <div className="mt-2 flex items-center justify-between">
            <div className="flex items-center">
              <LangToggle compact />
              <ThemeToggle />
            </div>
            {logout}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="glass sticky top-0 z-30 border-b border-line lg:hidden">
          <div className="flex h-14 items-center justify-between gap-2 px-4">
            <Logo href={base} size={30} subtitle={t.admin.title} />
            <div className="flex items-center">
              <LangToggle compact />
              <ThemeToggle />
              {logout}
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2.5">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn("btn btn-sm shrink-0", isActive(item.href, item.exact) ? "btn-soft" : "btn-ghost")}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            ))}
          </nav>
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-8">{children}</main>
      </div>
    </div>
  );
}

export function AdminLogin() {
  const { t } = useI18n();
  return (
    <div className="relative flex min-h-dvh flex-col overflow-hidden">
      <div className="hero-glow pointer-events-none absolute inset-0 opacity-70" aria-hidden="true" />
      <header className="relative flex items-center justify-end px-5 py-4">
        <LangToggle compact />
        <ThemeToggle />
      </header>
      <main className="relative flex flex-1 items-center justify-center px-5 pb-20">
        <div className="card fade-up w-full max-w-sm p-7 shadow-float sm:p-8">
          <Logo href={null} size={40} subtitle={t.admin.title} />
          <h1 className="mt-7 text-xl font-extrabold text-ink">{t.admin.loginTitle}</h1>
          <p className="mt-1.5 text-sm text-muted">{t.admin.loginSubtitle}</p>
          <ActionForm action={adminLoginAction} className="mt-6 space-y-4">
            <div>
              <label className="label" htmlFor="admin-username">
                {t.admin.username}
              </label>
              <input id="admin-username" name="username" className="input" autoComplete="username" required dir="ltr" />
            </div>
            <div>
              <label className="label" htmlFor="admin-password">
                {t.admin.password}
              </label>
              <PasswordInput id="admin-password" name="password" autoComplete="current-password" />
            </div>
            <SubmitButton className="btn btn-primary w-full">
              <ShieldCheck className="size-4" />
              {t.admin.signIn}
            </SubmitButton>
          </ActionForm>
        </div>
      </main>
    </div>
  );
}
