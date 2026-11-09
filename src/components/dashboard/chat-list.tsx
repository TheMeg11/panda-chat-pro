"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Ban,
  KeyRound,
  LogOut,
  Menu,
  MessageCirclePlus,
  Search,
  Settings,
  UserRoundSearch,
  X,
} from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { startDmAction } from "@/app/actions/dm";
import { Avatar, PandaMark } from "@/components/brand";
import { useI18n } from "@/components/i18n-provider";
import { CreateRoomButton } from "@/components/dashboard/create-room";
import { HideRoomButton } from "@/components/privacy";
import { ActionForm, LangToggle, LocalTime, SubmitButton, ThemeToggle } from "@/components/ui";
import type { DashboardChat } from "@/lib/rooms";
import { cn } from "@/lib/utils";

type Props = {
  chats: DashboardChat[];
  user: { displayName: string; username: string };
  /** visible (non-vault) room count used inside the create-room modal hint */
  roomLimit: number;
  totalRooms: number;
};

type FoundUser = { username: string; displayName: string };
const USERNAME_RE = /^[a-zA-Z0-9._]{2,32}$/;

/**
 * Telegram-style chat list: menu + search on top, the conversation list below,
 * a floating "new chat" button. No counters, no stats, no greeting — anything
 * that could hint at hidden chats simply does not exist on this page.
 */
export function ChatListPanel({ chats, user, roomLimit, totalRooms }: Props) {
  const { t } = useI18n();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [searched, setSearched] = useState<{ q: string; user: FoundUser | null } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? chats.filter(
        (c) => c.name.toLowerCase().includes(q) || (c.username ?? "").toLowerCase().includes(q),
      )
    : chats;

  // Exact-username search (debounced) — only for input that looks like a username.
  const unameQuery = query.trim().replace(/^@+/, "");
  const looksLikeUsername = USERNAME_RE.test(unameQuery) && unameQuery.length >= 2;
  const exactMatchOnList = looksLikeUsername
    ? chats.some((c) => c.username?.toLowerCase() === unameQuery.toLowerCase())
    : false;

  useEffect(() => {
    if (!looksLikeUsername || exactMatchOnList) return;
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/users/search?q=${encodeURIComponent(unameQuery)}`, { signal: ctrl.signal });
        if (!res.ok) return;
        const data = (await res.json()) as { user: FoundUser | null };
        setSearched({ q: unameQuery, user: data.user ?? null });
      } catch {
        /* aborted */
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [unameQuery, looksLikeUsername, exactMatchOnList]);

  // Derived: only the result for the CURRENT query is shown (undefined = idle).
  const found = searched && searched.q === unameQuery ? searched.user : undefined;

  const preview = (chat: DashboardChat): string => {
    if (chat.lastMessage) {
      const body = chat.lastMessage.fileName && !chat.lastMessage.body ? `📎 ${chat.lastMessage.fileName}` : chat.lastMessage.body;
      const prefix = chat.type === "room" && chat.lastMessage.author !== "system" ? `${chat.lastMessage.author}: ` : "";
      return prefix + body.replace(/\s+/g, " ").slice(0, 90);
    }
    return chat.type === "dm" ? t.dm.previewPrivate : chat.description || "—";
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      {/* Top bar: menu + search (Telegram-like) */}
      <div className="relative flex shrink-0 items-center gap-2 border-b border-line bg-surface px-3 py-2.5">
        <button
          type="button"
          className="btn btn-ghost btn-icon"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={t.common.menu}
          aria-expanded={menuOpen}
        >
          <Menu className="size-5" />
        </button>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-faint" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.dm.searchPlaceholder}
            className="input h-10 rounded-full bg-surface-2 ps-9"
            aria-label={t.dm.searchPlaceholder}
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="absolute inset-y-0 end-2 my-auto grid size-7 place-items-center rounded-full text-faint hover:text-ink"
              aria-label={t.common.close}
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>

        {menuOpen ? (
          <>
            <button type="button" className="fixed inset-0 z-30 cursor-default" onClick={() => setMenuOpen(false)} aria-hidden="true" tabIndex={-1} />
            <div className="pop-in absolute start-3 top-[3.4rem] z-40 w-64 overflow-hidden rounded-2xl border border-line bg-surface p-2 shadow-float">
              <div className="flex items-center gap-3 px-2 py-2">
                <Avatar name={user.displayName} size={38} />
                <div className="min-w-0 leading-tight">
                  <p className="truncate text-sm font-bold text-ink">{user.displayName}</p>
                  <p className="text-[11px] text-muted" dir="ltr">
                    @{user.username}
                  </p>
                </div>
              </div>
              <div className="my-1 border-t border-line" />
              <Link
                href="/dashboard/settings"
                onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-ink transition hover:bg-surface-3"
              >
                <Settings className="size-4" />
                {t.common.account}
              </Link>
              <div className="flex items-center justify-between px-3 py-1.5 text-sm font-semibold text-ink">
                <span className="flex items-center gap-2.5">
                  <ThemeToggle className="" />
                  {t.common.toggleTheme}
                </span>
                <LangToggle compact />
              </div>
              <div className="my-1 border-t border-line" />
              <form action={logoutAction}>
                <button
                  type="submit"
                  className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-rose-ink transition hover:bg-rose-soft"
                >
                  <LogOut className="size-4 rtl:-scale-x-100" />
                  {t.common.logout}
                </button>
              </form>
            </div>
          </>
        ) : null}
      </div>

      {/* Exact username search result */}
      {looksLikeUsername && !exactMatchOnList ? (
        <div className="shrink-0 border-b border-line px-3 py-3">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-faint">
            <UserRoundSearch className="size-3.5" />
            {t.dm.exactSearch}
          </p>
          {found === undefined ? null : found === null ? (
            <p className="px-1 text-xs text-muted">{t.dm.userNotFound}</p>
          ) : (
            <div className="flex items-center gap-3 rounded-xl bg-surface-2 px-3 py-2.5">
              <Avatar name={found.displayName} size={40} />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate text-sm font-bold text-ink">{found.displayName}</p>
                <p className="text-[11px] text-muted" dir="ltr">
                  @{found.username}
                </p>
              </div>
              <ActionForm action={startDmAction} className="inline-flex flex-col items-end">
                <input type="hidden" name="username" value={found.username} />
                <SubmitButton className="btn btn-primary btn-sm">
                  <MessageCirclePlus className="size-4" />
                  {t.dm.startChat}
                </SubmitButton>
              </ActionForm>
            </div>
          )}
        </div>
      ) : null}

      {/* Conversation list */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-24 pt-1.5">
        {chats.length === 0 ? (
          <div className="mt-16 flex flex-col items-center px-6 text-center">
            <PandaMark size={64} className="float-slow" />
            <p className="mt-5 font-extrabold text-ink">{t.dash.emptyTitle}</p>
            <p className="mt-1.5 text-sm text-muted">{t.dash.emptyText}</p>
          </div>
        ) : filtered.length === 0 ? (
          <p className="mt-10 text-center text-sm text-muted">{t.dm.nothingFound}</p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {filtered.map((chat) => {
              const active = pathname === `/dashboard/rooms/${chat.id}`;
              return (
                <li key={chat.id} className="relative">
                  <Link
                    href={`/dashboard/rooms/${chat.id}`}
                    data-room-id={chat.id}
                    className={cn(
                      "group flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition",
                      active ? "bg-accent-soft" : "hover:bg-surface-2",
                    )}
                  >
                    <HideRoomButton roomId={chat.id} />
                    <Avatar name={chat.name} size={46} square={chat.type !== "dm"} />
                    <div className="min-w-0 flex-1 leading-tight">
                      <div className="flex items-baseline justify-between gap-2">
                        <h3
                          className={cn("truncate text-[0.92rem] font-extrabold", active ? "text-accent-ink" : "text-ink")}
                          dir="auto"
                        >
                          {chat.name}
                        </h3>
                        <LocalTime iso={chat.lastActivityAt} mode="relative" className="shrink-0 text-[10px] text-faint" />
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <p className="truncate text-xs text-muted" dir="auto">
                          {preview(chat)}
                        </p>
                        {chat.hasPassword ? <KeyRound className="size-3 shrink-0 text-faint" /> : null}
                        {chat.isDisabled ? <Ban className="size-3 shrink-0 text-rose-ink" /> : null}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Floating "new chat" button */}
      <div className="pointer-events-none absolute bottom-5 end-5 z-20">
        <CreateRoomButton
          fab
          roomLimit={roomLimit}
          totalRooms={totalRooms}
          className="pointer-events-auto size-14 justify-center rounded-full shadow-float"
        />
      </div>
    </div>
  );
}
