"use client";

/**
 * v2.2.0 — the hidden-chats vault, SERVER-backed.
 *
 * Entry: five quick taps on the version number (About page footer) → PIN →
 * the hidden list. The list renders with the SAME building blocks as the main
 * dashboard list (avatar, name, live preview, relative time, unread dot) and
 * every row carries Open (tap the row) and Unhide (the trailing button).
 *
 * All state lives on the account now (hidden_rooms + users.hidden_pin_hash):
 * hiding survives reloads, browsers and devices, and every action revalidates
 * the dashboard so both lists update the instant the server answers.
 */

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EyeOff, FolderLock, KeyRound, ShieldCheck } from "lucide-react";
import {
  changeVaultPinAction,
  listHiddenChats,
  setVaultPinAction,
  unhideChatAction,
  vaultStatusAction,
  verifyVaultAction,
  type VaultChat,
} from "@/app/actions/vault";
import { Avatar } from "@/components/brand";
import { useI18n } from "@/components/i18n-provider";
import { Modal, SubmitButton } from "@/components/ui";

type Stage = "loading" | "setup" | "unlock" | "list" | "change";

/** v2.1.3 — 1400ms was too tight for real fingers (slow tappers never opened
 * the vault and concluded "nothing exists"); 2200ms stays secret but works. */
const TAP_WINDOW_MS = 2200;

/**
 * The secret entrance gesture: five quick taps (reset window 2200ms) on the
 * version line in the About page footer. Owns ONLY the counting and the
 * dialog open state.
 */
export function useVersionTap(): { onTap: () => void; open: boolean; setOpen: (open: boolean) => void } {
  const [open, setOpen] = useState(false);
  const [taps, setTaps] = useState(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => (tapTimer.current ? clearTimeout(tapTimer.current) : undefined), []);

  const onTap = () => {
    if (tapTimer.current) clearTimeout(tapTimer.current);
    const next = taps + 1;
    if (next >= 5) {
      setTaps(0);
      setOpen(true);
      return;
    }
    setTaps(next);
    tapTimer.current = setTimeout(() => setTaps(0), TAP_WINDOW_MS);
  };

  return { onTap, open, setOpen };
}

const PIN_ERROR_KEYS = {
  wrongPin: "wrongPin",
  pinShort: "pinShort",
  pinMismatch: "pinMismatch",
  pinExists: "pinExists",
  noPin: "setupTitle",
} as const;

/** Same preview rule the main chat list uses (chat-list.tsx `preview`). */
function previewOf(chat: VaultChat, privateFallback: string): string {
  if (chat.lastMessage) {
    const body =
      chat.lastMessage.fileName && !chat.lastMessage.body ? `📎 ${chat.lastMessage.fileName}` : chat.lastMessage.body;
    // the DM-creation system marker reads as "no conversation yet" here
    if (body === "dmCreated") return privateFallback;
    const prefix = chat.type === "room" && chat.lastMessage.author !== "system" ? `${chat.lastMessage.author}: ` : "";
    return prefix + body.replace(/\s+/g, " ").slice(0, 90);
  }
  return chat.type === "dm" ? privateFallback : "—";
}

/** Tiny relative-time formatter for the list rows (fa/en aware). */
function relTime(iso: string, lang: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60_000);
  if (min < 1) return lang === "fa" ? "همین حالا" : "now";
  if (min < 60) return lang === "fa" ? `${min} دقیقه` : `${min}m`;
  const hours = Math.round(min / 60);
  if (hours < 24) return lang === "fa" ? `${hours} ساعت` : `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return lang === "fa" ? `${days} روز` : `${days}d`;
  return new Date(iso).toLocaleDateString(lang === "fa" ? "fa-IR" : "en-US", { month: "short", day: "numeric" });
}

/** Remount the whole flow each time the dialog opens/closes — pristine state. */
export function VaultDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return <VaultDialogSession key={open ? "open" : "closed"} open={open} onOpenChange={onOpenChange} />;
}

function VaultDialogSession({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("loading");
  const [chats, setChats] = useState<VaultChat[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const close = () => onOpenChange(false);
  const errText = (code: string) => {
    const key = PIN_ERROR_KEYS[code as keyof typeof PIN_ERROR_KEYS];
    return key ? String(t.privacy[key]) : code;
  };

  // Which first view? The server decides (PIN set → unlock, else → setup).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const status = await vaultStatusAction();
      if (!cancelled) setStage(status.hasPin ? "unlock" : "setup");
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const openList = (rows: VaultChat[]) => {
    setChats(rows);
    setStage("list");
  };

  const unhide = (roomId: string) => {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("roomId", roomId);
      const res = await unhideChatAction({}, fd);
      if (res?.ok) {
        setChats((prev) => prev.filter((c) => c.id !== roomId));
        router.refresh(); // the main list gets the chat back instantly
      } else if (res?.error) {
        setError(errText(res.error));
      }
    });
  };

  return (
    <>
      {/* ------------------------------------------------ LOADING */}
      <Modal open={open && stage === "loading"} onClose={close} title={t.privacy.unlockTitle}>
        <div className="flex justify-center py-6">
          <span className="size-6 animate-spin rounded-full border-2 border-line border-t-accent-ink" />
        </div>
      </Modal>

      {/* ------------------------------------------------ PIN SETUP (first time) */}
      <Modal open={open && stage === "setup"} onClose={close} title={t.privacy.setupTitle} subtitle={t.privacy.setupText}>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            const fd = new FormData(e.currentTarget);
            const res = await setVaultPinAction({}, fd);
            if (res?.ok) {
              setFlash(t.privacy.setupSuccess);
              openList(await listHiddenChats());
            } else if (res?.error) {
              setError(errText(res.error));
            }
          }}
        >
          <input className="input h-11 w-full" type="password" name="pin" placeholder={t.privacy.pin} dir="ltr" autoComplete="new-password" required />
          <input className="input h-11 w-full" type="password" name="pin2" placeholder={t.privacy.pinConfirm} dir="ltr" autoComplete="new-password" required />
          {error ? <p className="text-sm font-semibold text-rose-ink">{error}</p> : null}
          <SubmitButton className="btn btn-primary w-full justify-center">{t.privacy.setupSubmit}</SubmitButton>
        </form>
      </Modal>

      {/* ------------------------------------------------ UNLOCK */}
      <Modal open={open && stage === "unlock"} onClose={close} title={t.privacy.unlockTitle} subtitle={t.privacy.unlockText}>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            const fd = new FormData(e.currentTarget);
            const res = await verifyVaultAction({}, fd);
            if (res?.ok) {
              openList((res.data?.chats as VaultChat[]) ?? []);
            } else if (res?.error) {
              setError(errText(res.error));
            }
          }}
        >
          <input className="input h-11 w-full" type="password" name="pin" placeholder={t.privacy.pin} dir="ltr" autoComplete="current-password" autoFocus required />
          {error ? <p className="text-sm font-semibold text-rose-ink">{error}</p> : null}
          <SubmitButton className="btn btn-primary w-full justify-center">{t.common.open}</SubmitButton>
        </form>
      </Modal>

      {/* ------------------------------------------------ HIDDEN LIST (main-page UI) */}
      <Modal open={open && stage === "list"} onClose={close} title={t.privacy.hiddenList} subtitle={t.privacy.hiddenNote}>
        <p className="mb-2 flex items-center gap-2 text-xs font-bold text-muted">
          <FolderLock className="size-3.5 text-accent-ink" aria-hidden="true" />
          {t.privacy.hiddenCount.replace("{n}", String(chats.length))}
        </p>
        {flash ? <p className="mb-3 rounded-xl bg-surface-2 px-3 py-2 text-sm font-bold text-accent-ink">{flash}</p> : null}
        {error ? <p className="mb-3 text-sm font-semibold text-rose-ink">{error}</p> : null}

        {chats.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <EyeOff className="size-8 text-faint" aria-hidden="true" />
            <p className="text-sm text-muted">{t.privacy.noHidden}</p>
          </div>
        ) : (
          <ul className="flex max-h-[min(30rem,60vh)] flex-col gap-0.5 overflow-y-auto overscroll-contain" data-testid="hidden-chat-list">
            {chats.map((chat) => (
              <li key={chat.id} className="relative">
                {/* red unread dot — Telegram-style, same as the main list */}
                <span
                  aria-hidden="true"
                  className={`absolute start-[0.45rem] top-1/2 z-10 size-[0.55rem] -translate-y-1/2 rounded-full bg-[#e0355f] shadow-[0_0_0_2px_var(--surface)] ${chat.hasUnread ? "block" : "hidden"}`}
                />
                <div className="flex min-h-[72px] items-center gap-2 rounded-2xl px-2.5 py-2.5 transition hover:bg-surface-2">
                  <Link href={`/dashboard/rooms/${chat.id}`} className="flex min-w-0 flex-1 items-center gap-3" onClick={close}>
                    <Avatar name={chat.name} size={46} square={chat.type !== "dm"} />
                    <div className="min-w-0 flex-1 leading-tight">
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="truncate text-[0.92rem] font-extrabold text-ink" dir="auto">
                          {chat.name}
                        </h3>
                        <span className="shrink-0 whitespace-nowrap text-[11px] text-faint">{relTime(chat.lastActivityAt, lang)}</span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5">
                        <p className="truncate text-xs text-muted" dir="auto">
                          {previewOf(chat, t.dm.previewPrivate)}
                        </p>
                        {chat.hasPassword ? <KeyRound className="size-3 shrink-0 text-faint" aria-hidden="true" /> : null}
                      </div>
                    </div>
                  </Link>
                  <button
                    type="button"
                    onClick={() => unhide(chat.id)}
                    disabled={pending}
                    className="btn btn-ghost btn-sm shrink-0 gap-1.5 text-muted hover:text-ink"
                    aria-label={`${t.privacy.unhide}: ${chat.name}`}
                  >
                    <ShieldCheck className="size-4 rtl:-scale-x-100" aria-hidden="true" />
                    <span className="hidden min-[420px]:inline">{t.privacy.unhide}</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-faint">{t.privacy.vaultServerNote}</p>
          <button type="button" className="btn btn-soft btn-sm shrink-0 self-start" onClick={() => setStage("change")}>
            {t.privacy.changePin}
          </button>
        </div>
      </Modal>

      {/* ------------------------------------------------ CHANGE PIN */}
      <Modal open={open && stage === "change"} onClose={close} title={t.privacy.changeTitle}>
        <form
          className="space-y-4"
          /* v2.5.0 (B-30): a stale "PINs don't match" under edited fields reads
             as a live error; clear it the moment any input changes. */
          onChange={() => setError(null)}
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            const fd = new FormData(e.currentTarget);
            const res = await changeVaultPinAction({}, fd);
            if (res?.ok) {
              setFlash(t.privacy.changeSuccess);
              setStage("list");
            } else if (res?.error) {
              setError(errText(res.error));
            }
          }}
        >
          <input className="input h-11 w-full" type="password" name="oldPin" placeholder={t.privacy.pinCurrent} dir="ltr" autoComplete="current-password" required />
          <input className="input h-11 w-full" type="password" name="pin" placeholder={t.privacy.pinNew} dir="ltr" autoComplete="new-password" required />
          <input className="input h-11 w-full" type="password" name="pin2" placeholder={t.privacy.pinConfirm} dir="ltr" autoComplete="new-password" required />
          {error ? <p className="text-sm font-semibold text-rose-ink">{error}</p> : null}
          <SubmitButton className="btn btn-primary w-full justify-center">{t.privacy.changeSubmit}</SubmitButton>
        </form>
      </Modal>
    </>
  );
}
