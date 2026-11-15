"use client";

/*
 * v1.7.0 — Telegram-style chat surface (per request):
 *  - the chat LIST no longer carries a hamburger or per-card menus;
 *  - the conversation header opens the PROFILE panel by tapping the avatar;
 *  - the profile panel carries a ☰ menu in its corner with EVERY chat action
 *    (block, clear history, delete chat, hide chat) plus the global account
 *    links that used to live in the list-page hamburger.
 * One shared implementation serves the DM profile panel, the owner manage
 * drawer and the read-only info modal of rooms the viewer merely joined.
 */

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Ban,
  Bell,
  Bot,
  EyeOff,
  Info,
  LogOut,
  Menu,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { deleteChatAction } from "@/app/actions/rooms";
import { blockPeerAction, clearChatAction } from "@/app/actions/rooms";
import { logoutAction } from "@/app/actions/auth";
import { Avatar } from "@/components/brand";
import { useI18n } from "@/components/i18n-provider";
import { HideRoomModal } from "@/components/privacy";
import { ActionForm, LangToggle, SubmitButton, ThemeToggle } from "@/components/ui";
import { errorText } from "@/lib/i18n";
import { cn, fmt } from "@/lib/utils";

export type ChatHamburgerMenuProps = {
  roomId: string;
  /** "dm" adds the block/unblock row; rooms show clear/delete/hide for owners */
  variant: "dm" | "room";
  isOwner: boolean;
  /** DM only — the current block state (server-computed) */
  blocked?: boolean;
  /** v1.7.0 — callback after block state flips (let parents re-render) */
  onAfterAction?: () => void;
  className?: string;
};

/**
 * The ☰ menu that lives in the corner of the profile/info panel.
 * Chat actions on top (block / clear history / delete / hide), then the
 * global links that used to sit in the chat-list hamburger.
 */
export function ChatHamburgerMenu({ roomId, variant, isOwner, blocked, onAfterAction, className }: ChatHamburgerMenuProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [hideOpen, setHideOpen] = useState(false);
  const [blockState, blockFormAction, blockPending] = useActionState(blockPeerAction, {});

  return (
    <div className={cn("relative shrink-0", className)}>
      <button
        type="button"
        className="btn btn-ghost btn-icon"
        onClick={() => setOpen((v) => !v)}
        aria-label={t.common.menu}
        aria-expanded={open}
      >
        <Menu className="size-5" />
      </button>

      {hideOpen ? (
        <HideRoomModal roomId={roomId} open onClose={() => setHideOpen(false)} onHidden={() => window.location.assign("/dashboard")} />
      ) : null}

      {open ? (
        <>
          <button type="button" className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} aria-hidden="true" tabIndex={-1} />
          <div className="pop-in absolute end-0 top-[2.6rem] z-50 w-72 overflow-hidden rounded-2xl border border-line bg-surface p-2 shadow-float">
            {/* ---- chat actions ---- */}
            {variant === "dm" ? (
              <form
                action={blockFormAction}
                onSubmit={() => {
                  // close immediately; the server action revalidates the path —
                  // a follow-up refresh pulls the new block state into the page
                  setOpen(false);
                  onAfterAction?.();
                  window.setTimeout(() => router.refresh(), 400);
                }}
              >
                <input type="hidden" name="roomId" value={roomId} />
                <input type="hidden" name="op" value={blocked ? "unblock" : "block"} />
                <SubmitButton className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-ink transition hover:bg-surface-3" disabled={blockPending} aria-busy={blockPending}>
                  {blocked ? <ShieldOff className="size-4" /> : <Ban className="size-4" />}
                  {blocked ? t.dm.unblock : t.dm.block}
                </SubmitButton>
              </form>
            ) : null}
            {blockState.error ? <p className="px-3 pb-1 text-xs text-rose-ink">{errorText(t, blockState.error)}</p> : null}

            {isOwner || variant === "dm" ? (
              <ActionForm action={clearChatAction} showMessage={false} confirm={t.dm.clearHistoryConfirm}>
                <input type="hidden" name="roomId" value={roomId} />
                <SubmitButton className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-ink transition hover:bg-surface-3">
                  <Trash2 className="size-4" />
                  {t.dm.clearHistory}
                </SubmitButton>
              </ActionForm>
            ) : null}

            {variant === "dm" || isOwner ? (
              <ActionForm action={deleteChatAction} showMessage={false} confirm={t.dm.deleteChatConfirm}>
                <input type="hidden" name="roomId" value={roomId} />
                <SubmitButton className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-rose-ink transition hover:bg-rose-soft">
                  <Trash2 className="size-4 rtl:-scale-x-100" />
                  {variant === "dm" ? t.dm.deleteChat : t.room.deleteRoom}
                </SubmitButton>
              </ActionForm>
            ) : null}

            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setHideOpen(true);
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-ink transition hover:bg-surface-3"
            >
              <EyeOff className="size-4" />
              {t.dm.hideChat}
            </button>

            <div className="my-1 border-t border-line" />

            {/* ---- global links (the former list-page hamburger) ---- */}
            <nav className="flex flex-col">
              <LinkItem href="/dashboard/settings#account" icon={<UserRound className="size-4" />} label={t.common.account} onClick={() => setOpen(false)} />
              <LinkItem href="/dashboard/settings#notifications" icon={<Bell className="size-4" />} label={t.common.notifications} onClick={() => setOpen(false)} />
              <LinkItem href="/dashboard/settings#security" icon={<ShieldCheck className="size-4" />} label={t.common.security} onClick={() => setOpen(false)} />
              <LinkItem href="/dashboard/settings#telegram" icon={<Bot className="size-4" />} label={t.common.telegramBotSettings} onClick={() => setOpen(false)} />
              <LinkItem href="/dashboard/about" icon={<Info className="size-4" />} label={t.common.aboutSite} onClick={() => setOpen(false)} />
            </nav>
            <div className="my-1 border-t border-line" />
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
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-rose-ink transition hover:bg-rose-soft"
              >
                <LogOut className="size-4 rtl:-scale-x-100" />
                {t.common.logout}
              </button>
            </form>
          </div>
        </>
      ) : null}
    </div>
  );
}

function LinkItem({ href, icon, label, onClick }: { href: string; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <a href={href} onClick={onClick} className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-ink transition hover:bg-surface-3">
      {icon}
      {label}
    </a>
  );
}

export type DmProfileProps = {
  roomId: string;
  open: boolean;
  onClose: () => void;
  peer: {
    displayName: string;
    username: string | null;
    bio?: string | null;
    /** ISO timestamp of the peer's last activity — drives the Telegram-style line */
    lastSeenAt: string | null;
  };
  avatarSrc?: string;
  blocked: boolean;
  /** opens the existing chat-privacy sheet (E2EE + self-destruct) */
  onOpenPrivacy: () => void;
  e2eeEnabled: boolean;
};

/**
 * The DM profile panel — Telegram-like: big avatar, name, @username, last
 * seen, bio; a ☰ menu in the corner with every chat action.
 */
export function DmProfilePanel({ roomId, open, onClose, peer, avatarSrc, blocked, onOpenPrivacy, e2eeEnabled }: DmProfileProps) {
  const { t, lang } = useI18n();
  /** wall clock captured OUTSIDE render (impure-call rule) + 30s ticker */
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (!open) return;
    // async scheduling keeps render pure; first tick lands right after commit
    const t = window.setTimeout(() => setNow(Date.now()), 0);
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      window.clearTimeout(t);
      window.clearInterval(id);
    };
  }, [open]);

  const ms = peer.lastSeenAt && now ? now - new Date(peer.lastSeenAt).getTime() : Number.POSITIVE_INFINITY;
  const online = ms < 90_000;
  const recent = ms < 3 * 86_400_000;

  return (
    <>
      {open ? (
        <>
          <button type="button" className="fixed inset-0 z-40 cursor-default bg-black/40" onClick={onClose} aria-hidden="true" tabIndex={-1} />
          <div className="pop-in fixed inset-x-3 top-16 z-50 mx-auto max-w-md overflow-hidden rounded-3xl border border-line bg-surface shadow-float sm:inset-x-auto sm:end-6" role="dialog" aria-label={t.dm.profileTitle}>
            <div className="relative flex items-center justify-end border-b border-line px-2 py-2">
              <p className="absolute inset-x-0 text-center text-sm font-extrabold text-ink">{t.dm.profileTitle}</p>
              <ChatHamburgerMenu roomId={roomId} variant="dm" isOwner blocked={blocked} className="z-10" />
              <button type="button" className="btn btn-ghost btn-icon z-10" onClick={onClose} aria-label={t.common.close}>
                <X className="size-5" />
              </button>
            </div>
            <div className="flex flex-col items-center px-6 py-6 text-center">
              <Avatar name={peer.displayName} size={96} src={avatarSrc} className="shadow-card" />
              <p className="mt-4 text-lg font-extrabold text-ink" dir="auto">
                {peer.displayName}
              </p>
              {peer.username ? (
                <p className="mt-0.5 text-sm text-muted" dir="ltr">
                  @{peer.username}
                </p>
              ) : null}
              <p className={cn("mt-1.5 flex items-center gap-1.5 text-xs font-bold", online ? "text-[#2ea36f]" : "text-muted")}>
                <span className={cn("size-1.5 rounded-full", online ? "bg-[#4cc79a]" : "bg-faint")} aria-hidden="true" />
                {/* keyed by `tick` so the relative string recomputes */}
                <span>
                  {online
                    ? t.dm.lastSeenOnline
                    : peer.lastSeenAt
                      ? recent
                        ? fmt(t.dm.lastSeenAt, { time: relative(peer.lastSeenAt, lang) })
                        : t.dm.lastSeenRecently
                      : t.dm.lastSeenUnknown}
                </span>
              </p>
              {peer.bio ? (
                <p className="mt-3 text-sm leading-relaxed text-ink-2" dir="auto">
                  {peer.bio}
                </p>
              ) : null}
            </div>
            {blocked ? <p className="notice notice-amber mx-5 mb-4">{t.dm.blockedNote}</p> : null}
            <div className="border-t border-line px-4 py-3">
              <button
                type="button"
                data-tutorial="vault"
                onClick={() => {
                  onClose();
                  onOpenPrivacy();
                }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-ink transition hover:bg-surface-3"
              >
                <ShieldCheck className="size-4 text-accent-ink" />
                {t.dm.chatSettings}
                {e2eeEnabled ? <span className="badge badge-accent ms-auto">{t.e2ee.badge}</span> : null}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

/** Minimal relative formatter for the last-seen line (mirrors LocalTime). */
function relative(iso: string, lang: "fa" | "en"): string {
  const diff = Date.now() - new Date(iso).getTime();
  const rtf = new Intl.RelativeTimeFormat(lang === "fa" ? "fa-IR" : "en", { numeric: "auto" });
  const minutes = Math.round(diff / 60_000);
  if (minutes < 60) return rtf.format(-Math.max(1, minutes), "minute");
  const hours = Math.round(minutes / 60);
  if (hours < 24) return rtf.format(-hours, "hour");
  return rtf.format(-Math.round(hours / 24), "day");
}

/** Room info for rooms the viewer JOINED — read-only profile + the shared menu. */
export function JoinedRoomInfoPanel({
  roomId,
  open,
  onClose,
  name,
  description,
  memberCount,
  avatarSrc,
}: {
  roomId: string;
  open: boolean;
  onClose: () => void;
  name: string;
  description: string;
  memberCount: number;
  avatarSrc?: string;
}) {
  const { t, lang } = useI18n();
  return (
    <>
      {open ? (
        <>
          <button type="button" className="fixed inset-0 z-40 cursor-default bg-black/40" onClick={onClose} aria-hidden="true" tabIndex={-1} />
          <div className="pop-in fixed inset-x-3 top-16 z-50 mx-auto max-w-md overflow-hidden rounded-3xl border border-line bg-surface shadow-float sm:inset-x-auto sm:end-6" role="dialog" aria-label={name}>
            <div className="relative flex items-center justify-end border-b border-line px-2 py-2">
              <p className="absolute inset-x-0 text-center text-sm font-extrabold text-ink" dir="auto">
                {name}
              </p>
              <ChatHamburgerMenu roomId={roomId} variant="room" isOwner={false} className="z-10" />
              <button type="button" className="btn btn-ghost btn-icon z-10" onClick={onClose} aria-label={t.common.close}>
                <X className="size-5" />
              </button>
            </div>
            <div className="flex flex-col items-center px-6 py-6 text-center">
              <Avatar name={name} size={96} square src={avatarSrc} className="shadow-card" />
              <p className="mt-4 text-lg font-extrabold text-ink" dir="auto">
                {name}
              </p>
              <p className="mt-1 text-xs font-bold text-muted">
                {fmt(lang === "fa" ? "{n} عضو" : "{n} members", { n: String(memberCount) })}
              </p>
              {description ? (
                <p className="mt-3 text-sm leading-relaxed text-ink-2" dir="auto">
                  {description}
                </p>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
