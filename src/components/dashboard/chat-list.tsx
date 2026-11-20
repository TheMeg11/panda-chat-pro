"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Ban,
  KeyRound,
  MessageCirclePlus,
  Search,
  SquarePen,
  WifiOff,
  X,
} from "lucide-react";
import { startDmAction } from "@/app/actions/dm";
import { Avatar, PandaMark } from "@/components/brand";
import { useI18n } from "@/components/i18n-provider";
import { CreateRoomButton } from "@/components/dashboard/create-room";
import { BottomNav, SidebarHeader } from "@/components/dashboard/nav";
import { ActionForm, LocalTime, SubmitButton } from "@/components/ui";
import type { DashboardChat } from "@/lib/rooms";
import { cn } from "@/lib/utils";

type Props = {
  /** initial chats — empty by design (SSR privacy); the list loads from /api/chats */
  chats: DashboardChat[];
  user: {
    displayName: string;
    username: string;
    /** needed to render /api/users/<id>/avatar */
    id: string;
    bio?: string | null;
    /** 1 when an avatar row exists — used as a cache-busting query param */
    avatarVersion?: number;
  };
  /** visible (non-vault) room count used inside the create-room modal hint */
  roomLimit: number;
  totalRooms: number;
};

type FoundUser = { username: string; displayName: string };
const USERNAME_RE = /^[a-zA-Z0-9._]{2,32}$/;

/**
 * v2.0 theme chat list — one unified list (rooms + DMs) inside the sidebar,
 * with a calm greeting header, pill search and a "new chat" pencil button.
 * No counters, no stats — anything that could hint at hidden chats does not
 * exist on this page. The list is fetched CLIENT-SIDE from /api/chats
 * (no-store) so hidden conversations never appear in the server-rendered HTML.
 */
export function ChatListPanel({ chats: initialChats, user, roomLimit, totalRooms: initialTotal }: Props) {
  const { t } = useI18n();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [searched, setSearched] = useState<{ q: string; user: FoundUser | null } | null>(null);
  const [chats, setChats] = useState<DashboardChat[]>(initialChats);
  const [totalRooms, setTotalRooms] = useState(initialTotal);
  const [loaded, setLoaded] = useState(false);
  const [unread, setUnread] = useState(0);
  // v2.3.0 — weak networks: after two failed syncs in a row, say so instead of
  // silently showing stale data (the list itself is kept as-is).
  const failsRef = useRef(0);
  const [connLost, setConnLost] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const tickRef = useRef(0);

  // §4.4: fetch the conversation list client-side, never from SSR HTML.
  // Live sync: the list POLLS while the dashboard is open — new messages
  // refresh previews/unread dots, joined rooms and incoming DMs appear
  // without any navigation, and every entry into the site syncs immediately.
  useEffect(() => {
    let cancelled = false;
    let busy = false;
    const load = async () => {
      if (cancelled || busy) return;
      busy = true;
      try {
        // v2.3.0 — bound the request: a hung connection must not block the
        // polling cycle (busy stays true until fetch settles).
        const res = await fetch("/api/chats", { cache: "no-store", signal: AbortSignal.timeout(10_000) });
        if (!res.ok) return;
        const data = (await res.json()) as { chats: DashboardChat[]; totalRooms: number };
        if (cancelled) return;
        setChats(data.chats ?? []);
        setTotalRooms(data.totalRooms ?? 0);
        setUnread((data.chats ?? []).filter((c) => c.hasUnread).length);
        failsRef.current = 0;
        setConnLost(false);
      } catch {
        /* offline — keep whatever we have, but surface the state */
        failsRef.current += 1;
        if (failsRef.current >= 2) setConnLost(true);
      } finally {
        if (!cancelled) setLoaded(true);
        busy = false;
      }
    };
    void load();
    const timer = window.setInterval(() => {
      // hidden tabs sync 4× slower (the notify runtime keeps its own cadence)
      if (document.hidden && tickRef.current % 4 !== 0) {
        tickRef.current += 1;
        return;
      }
      tickRef.current += 1;
      void load();
    }, 4000);
    const onVisible = () => {
      if (!document.hidden) void load();
    };
    const onFocus = () => void load();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, [pathname]);

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
      // v2.4.0 — voice clips read as "Voice message", not a raw file name.
      const body =
        chat.lastMessage.fileName?.startsWith("voice-") && !chat.lastMessage.body
          ? t.dm.voicePreview
          : chat.lastMessage.fileName && !chat.lastMessage.body
            ? `📎 ${chat.lastMessage.fileName}`
            : chat.lastMessage.body;
      const prefix = chat.type === "room" && chat.lastMessage.author !== "system" ? `${chat.lastMessage.author}: ` : "";
      return prefix + body.replace(/\s+/g, " ").slice(0, 90);
    }
    return chat.type === "dm" ? t.dm.previewPrivate : chat.description || "—";
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-surface">
      {/* deep-navy header (theme's SidebarHeader) — brand + greeting */}
      <SidebarHeader />
      <div className="bg-side px-3 pb-4 pt-1 text-white md:px-4 lg:px-5" data-tutorial="user-search">
        <div className="flex items-center gap-2.5">
          <Link href="/dashboard/profile" className="shrink-0 rounded-full" aria-label={t.common.profile}>
            <Avatar
              name={user.displayName}
              size={38}
              src={user.avatarVersion ? `/api/users/${user.id}/avatar?v=${user.avatarVersion}` : undefined}
            />
          </Link>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-[15px] font-bold text-white">{user.displayName}</p>
            <p className="truncate text-[11px] text-white/60" dir="ltr">
              @{user.username}
            </p>
          </div>
          <Link
            href="/dashboard/settings"
            aria-label={t.common.account}
            title={t.common.account}
            className="grid size-9 shrink-0 place-items-center rounded-full text-white/75 transition hover:bg-white/10 hover:text-white"
          >
            <SquarePen className="size-[18px]" />
          </Link>
        </div>

        {/* pill search */}
        <div className="relative mt-3">
          <Search className="pointer-events-none absolute inset-y-0 start-3.5 my-auto size-4 text-white/50" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.dm.searchPlaceholder}
            className="h-10 w-full rounded-full border border-white/10 bg-white/10 ps-10 pe-9 text-sm text-white placeholder:text-white/45 outline-none transition focus:border-white/25 focus:bg-white/15"
            aria-label={t.dm.searchPlaceholder}
          />
          {query ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                inputRef.current?.focus();
              }}
              className="absolute inset-y-0 end-2 my-auto grid size-7 place-items-center rounded-full text-white/60 hover:text-white"
              aria-label={t.common.close}
            >
              <X className="size-4" />
            </button>
          ) : null}
        </div>
      </div>

      {/* Exact username search result */}
      {looksLikeUsername && !exactMatchOnList ? (
        <div className="shrink-0 border-b border-line px-3 py-3">
          <p className="mb-2 px-1 text-[11px] font-bold text-faint">{t.dm.exactSearch}</p>
          {found === undefined ? null : found === null ? (
            <p className="px-1 text-xs text-muted">{t.dm.userNotFound}</p>
          ) : (
            <div className="flex items-center gap-3 rounded-2xl bg-surface-2 px-3 py-2.5">
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

      {/* v2.3.0 — weak-connection banner (kept data stays visible beneath it) */}
      {connLost ? (
        <div className="shrink-0 border-b border-line bg-amber-soft/70 px-4 py-2 text-center text-xs font-semibold text-amber-ink">
          <WifiOff className="me-1.5 inline size-3.5 align-[-3px]" />
          {t.chat.reconnecting}
        </div>
      ) : null}

      {/* Conversation list — unified, theme-style rows */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-4 pt-1.5" data-tutorial="chat-list">
        {!loaded ? (
          <div className="mt-8 flex flex-col gap-2 px-2" aria-hidden="true">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 rounded-2xl px-2.5 py-2.5">
                <span className="size-11 shrink-0 animate-pulse rounded-full bg-surface-2" />
                <span className="flex-1 space-y-1.5">
                  <span className="block h-3 w-1/2 animate-pulse rounded bg-surface-2" />
                  <span className="block h-2.5 w-3/4 animate-pulse rounded bg-surface-2" />
                </span>
              </div>
            ))}
          </div>
        ) : chats.length === 0 ? (
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
                  {/* red unread dot (Telegram-style) */}
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute start-[0.45rem] top-1/2 z-10 size-[0.55rem] -translate-y-1/2 rounded-full bg-[#e0355f] shadow-[0_0_0_2px_var(--surface)]",
                      chat.hasUnread ? "block" : "hidden",
                    )}
                  />
                  <Link
                    href={`/dashboard/rooms/${chat.id}`}
                    data-room-id={chat.id}
                    className={cn(
                      "flex min-h-[72px] items-center gap-3 rounded-2xl px-2.5 py-2.5 transition",
                      active ? "bg-accent-soft" : "hover:bg-surface-2 active:bg-surface-2",
                    )}
                  >
                    <Avatar name={chat.name} size={46} square={chat.type !== "dm"} />
                    <div className="min-w-0 flex-1 leading-tight">
                      <div className="flex items-baseline justify-between gap-2">
                        <h3
                          className={cn("truncate text-[0.92rem] font-extrabold", active ? "text-accent-ink" : "text-ink")}
                          dir="auto"
                        >
                          {chat.name}
                        </h3>
                        <LocalTime iso={chat.lastActivityAt} mode="relative" className="shrink-0 whitespace-nowrap text-[11px] text-faint" />
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

      {/* Floating "new chat" button (theme style — brand circle, bottom end) */}
      <div className="pointer-events-none absolute bottom-5 end-5 z-20" data-tutorial="new-chat">
        <CreateRoomButton
          fab
          roomLimit={roomLimit}
          totalRooms={totalRooms}
          className="pointer-events-auto size-14 justify-center rounded-full shadow-float"
        />
      </div>

      {/* Mobile bottom nav (chats / settings / profile) — no hidden entry */}
      <BottomNav unread={unread} />
    </div>
  );
}
