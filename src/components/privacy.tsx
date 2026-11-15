"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Copy, EyeOff, MoreHorizontal, Trash2 } from "lucide-react";
import { deleteChatAction } from "@/app/actions/rooms";
import { PandaMark } from "@/components/brand";
import { useI18n } from "@/components/i18n-provider";
import { ActionForm, Modal, SubmitButton } from "@/components/ui";
import { APP_NAME, APP_VERSION } from "@/lib/version";
import { hiddenRoomIds, hideRoom, setPin as setVaultPin, vaultHasPin } from "@/lib/vault";
import { useVersionTap, VaultDialog, type RoomBrief } from "@/components/security/vault-dialog";
import type { DashboardChat } from "@/lib/rooms";
import { cn } from "@/lib/utils";

/** @deprecated import from "@/components/security/vault-dialog" — kept for the existing public surface. */
export type { RoomBrief };
export { useVersionTap, VaultDialog };

/** v1.5.3 — the long-press duration required to hide a chat (milliseconds). */
export const HOLD_TO_HIDE_MS = 5000;

/**
 * Re-applies the pre-paint hidden-room rules after hydration (covers the rare case
 * where the inline boot script could not run). Renders nothing.
 */
export function HiddenRoomsBoot() {
  const pathname = usePathname();
  useEffect(() => {
    const ids = hiddenRoomIds();
    if (!ids.length) return;
    const sel = ids
      .filter((id) => /^[0-9a-f-]{36}$/.test(id))
      .map((id) => `[data-room-id="${id}"]`)
      .join(",");
    if (!sel) return;
    const style = document.createElement("style");
    style.textContent = `${sel}{display:none !important}`;
    document.head.appendChild(style);
    return () => style.remove();
  }, [pathname]);
  return null;
}

/**
 * The vault PIN setup / confirm modal — shared by every hide entrance
 * (5s hold on the chat card, 5s hold on the chat/room header).
 */
export function HideRoomModal({
  roomId,
  open,
  onClose,
  onHidden,
}: {
  roomId: string;
  open: boolean;
  onClose: () => void;
  onHidden?: () => void;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [state, setState] = useState<"pin" | "confirm">("confirm");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Fresh state on every open; the vault decides whether a PIN already exists.
  useEffect(() => {
    if (!open) return;
    setPin("");
    setPin2("");
    setError(null);
    setState(vaultHasPin() ? "confirm" : "pin");
  }, [open, roomId]);

  const finishHide = useCallback(() => {
    hideRoom(roomId);
    const el = document.querySelector(`[data-room-id="${roomId}"]`);
    if (el instanceof HTMLElement) el.style.display = "none";
    onClose();
    onHidden?.();
    router.refresh();
  }, [roomId, onClose, onHidden, router]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={state === "pin" ? t.privacy.pinTitle : t.privacy.hide}
      subtitle={state === "pin" ? t.privacy.pinText : undefined}
    >
      {state === "pin" ? (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            if (pin.length < 4) return setError(t.privacy.pinShort);
            if (pin !== pin2) return setError(t.privacy.pinMismatch);
            await setVaultPin(pin);
            finishHide();
          }}
        >
          <input
            type="password"
            className="input"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder={t.privacy.pin}
            autoFocus
            autoComplete="new-password"
            dir="ltr"
          />
          <input
            type="password"
            className="input"
            value={pin2}
            onChange={(e) => setPin2(e.target.value)}
            placeholder={t.privacy.pinConfirm}
            autoComplete="new-password"
            dir="ltr"
          />
          {error ? <p className="notice notice-rose">{error}</p> : null}
          <button type="submit" className="btn btn-primary w-full">
            <EyeOff className="size-4" />
            {t.privacy.hide}
          </button>
        </form>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-muted">{t.privacy.hideConfirm}</p>
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary flex-1" onClick={onClose}>
              {t.common.cancel}
            </button>
            <button type="button" className="btn btn-primary flex-1" onClick={finishHide}>
              <EyeOff className="size-4" />
              {t.privacy.hide}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

/**
 * v1.5.3 — hide a chat by PRESSING AND HOLDING it for 5 seconds.
 *
 * Wraps a chat card (or any element). While held, a progress bar sweeps the
 * top edge so the gesture is visible; releasing early cancels silently. The
 * browser context menu (long-press on touch) and the card's click/navigation
 * are suppressed while the hold is in progress or after it completed.
 */
export function HoldToHide({
  roomId,
  children,
  className,
  onHidden,
  disabled,
}: {
  roomId: string;
  children: React.ReactNode;
  className?: string;
  onHidden?: () => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [modal, setModal] = useState(false);
  const [progress, setProgress] = useState<number | null>(null); // 0..1, null = idle
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const doneRef = useRef(false);

  const clearTimer = () => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  };

  const start = () => {
    if (disabled || modal) return;
    doneRef.current = false;
    const t0 = Date.now();
    setProgress(0);
    timer.current = setInterval(() => {
      const p = Math.min(1, (Date.now() - t0) / HOLD_TO_HIDE_MS);
      setProgress(p);
      if (p >= 1) {
        clearTimer();
        setProgress(null);
        doneRef.current = true;
        try {
          navigator.vibrate?.(60);
        } catch {
          /* unsupported */
        }
        setModal(true);
      }
    }, 50);
  };

  const stop = () => {
    clearTimer();
    setProgress(null);
  };

  useEffect(() => () => clearTimer(), []);

  return (
    <div
      className={cn("relative", className)}
      title={t.privacy.holdToHide}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      onContextMenu={(e) => {
        // long-press on touch opens the browser menu — swallow it: the hold
        // gesture belongs to the hide flow
        e.preventDefault();
      }}
      // the wrapping card is a <Link>: after (or during) a completed hold, the
      // follow-up click must NOT navigate
      onClickCapture={(e) => {
        if (doneRef.current) {
          e.preventDefault();
          e.stopPropagation();
          doneRef.current = false;
        }
      }}
    >
      {children}
      {/* hold progress bar along the card's top edge */}
      {progress !== null ? (
        <div
          className="pointer-events-none absolute inset-x-0 top-0 z-20 h-1 overflow-hidden rounded-t-xl"
          aria-hidden="true"
        >
          <div
            className="h-full bg-accent transition-none"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
      ) : null}
      {progress !== null ? (
        <div
          className="pointer-events-none absolute inset-x-2 bottom-1 z-20 rounded-lg bg-surface/90 px-2 py-1 text-center text-[10.5px] font-bold text-ink shadow-soft backdrop-blur"
          aria-hidden="true"
        >
          {t.privacy.holding}
        </div>
      ) : null}
      <HideRoomModal roomId={roomId} open={modal} onClose={() => setModal(false)} onHidden={onHidden} />
    </div>
  );
}

/**
 * v1.5.3 — the ⋯ button on every chat card is now the FULL options menu:
 * open chat, copy invite link (own rooms), delete chat. Hiding a chat is NOT
 * in this menu — it only happens via the 5-second hold gesture.
 */
export function ChatCardOptions({ chat }: { chat: DashboardChat }) {
  const { t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyInvite = async () => {
    if (!chat.inviteUrl) return;
    try {
      await navigator.clipboard.writeText(chat.inviteUrl);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        setMenuOpen(false);
      }, 900);
    } catch {
      /* clipboard denied — menu stays open */
    }
  };

  return (
    <div
      className="relative"
      data-chat-options-root=""
      // the ⋯ control is INSIDE the HoldToHide wrapper — its own pointer
      // interaction must never start (or cancel-conflict with) the hold timer
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onPointerCancel={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        title={t.privacy.chatOptions}
        aria-label={t.privacy.chatOptions}
        aria-expanded={menuOpen}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMenuOpen((v) => !v);
          setConfirmDelete(false);
        }}
        className="absolute end-2.5 top-2.5 z-10 grid size-8 place-items-center rounded-lg bg-surface/80 text-faint opacity-0 backdrop-blur transition hover:bg-surface-3 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-60"
      >
        <MoreHorizontal className="size-4" />
      </button>

      {menuOpen ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-30 cursor-default"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen(false);
            }}
            aria-hidden="true"
            tabIndex={-1}
          />
          <div
            className="pop-in absolute end-2 top-11 z-40 w-60 overflow-hidden rounded-2xl border border-line bg-surface p-2 shadow-float"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
          >
            <a
              href={`/dashboard/rooms/${chat.id}`}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-ink transition hover:bg-surface-3"
              onClick={() => setMenuOpen(false)}
            >
              {t.privacy.openChat}
            </a>
            {chat.inviteUrl ? (
              <button
                type="button"
                onClick={copyInvite}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-ink transition hover:bg-surface-3"
              >
                <Copy className="size-4 text-faint" />
                {copied ? t.common.copied : t.privacy.copyInvite}
              </button>
            ) : null}
            <div className="my-1 border-t border-line" />
            {confirmDelete ? (
              <div className="rounded-xl bg-rose-soft p-3">
                <p className="text-xs font-extrabold text-rose-ink">{t.privacy.deleteChatTitle}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-ink-2">{t.privacy.deleteChatText}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm flex-1"
                    onClick={() => setConfirmDelete(false)}
                  >
                    {t.common.cancel}
                  </button>
                  <ActionForm action={deleteChatAction} className="flex-1" showMessage={false}>
                    <input type="hidden" name="roomId" value={chat.id} />
                    <SubmitButton className="btn btn-danger btn-sm w-full">
                      <Trash2 className="size-3.5" />
                      {t.common.delete}
                    </SubmitButton>
                  </ActionForm>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-rose-ink transition hover:bg-rose-soft"
              >
                <Trash2 className="size-4" />
                {t.privacy.deleteChat}
              </button>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}

/**
 * The secret entrance: Settings → tap the app version 5 times quickly.
 * Thin wrapper now — the gesture lives in useVersionTap() and the whole vault
 * (PIN setup, unlock, hidden list, PIN change) in VaultDialog, both reusable
 * from any footer (an About page mounts the same pair).
 */
export function VersionTap({ rooms }: { rooms: RoomBrief[] }) {
  const { lang } = useI18n();
  const { onTap, open, setOpen } = useVersionTap();

  return (
    <>
      <div className="mt-10 flex flex-col items-center gap-1 border-t border-line pt-6 pb-2 text-center">
        <button
          type="button"
          onClick={onTap}
          className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-faint transition hover:text-muted"
          aria-label={`${APP_NAME} ${APP_VERSION}`}
          title={`${APP_NAME}`}
        >
          <PandaMark size={18} />
          <span dir="ltr">
            {APP_NAME} v{APP_VERSION}
          </span>
        </button>
        <p className="text-[10.5px] text-faint">
          {new Date().toLocaleDateString(lang === "fa" ? "fa-IR" : "en-US", { year: "numeric" })} · {APP_NAME}
        </p>
      </div>

      <VaultDialog open={open} onOpenChange={setOpen} rooms={rooms} />
    </>
  );
}
