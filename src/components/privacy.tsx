"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { EyeOff, FolderLock, KeyRound, MoreHorizontal, ShieldCheck } from "lucide-react";
import { PandaMark } from "@/components/brand";
import { useI18n } from "@/components/i18n-provider";
import { Modal } from "@/components/ui";
import { APP_NAME, APP_VERSION } from "@/lib/version";
import {
  checkPin as checkVaultPin,
  hiddenRoomIds,
  hideRoom,
  isRoomHidden,
  setPin as setVaultPin,
  unhideRoom,
  vaultHasPin,
} from "@/lib/vault";

export type RoomBrief = { id: string; name: string };

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

/** Small "⋯" affordance on every room card — hides the chat behind the device PIN. */
export function HideRoomButton({ roomId }: { roomId: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [state, setState] = useState<"idle" | "pin" | "confirm">("idle");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [error, setError] = useState<string | null>(null);

  const finishHide = () => {
    hideRoom(roomId);
    setState("idle");
    // Hide instantly, independent of how/when the router refresh re-renders.
    const el = document.querySelector(`[data-room-id="${roomId}"]`);
    if (el instanceof HTMLElement) el.style.display = "none";
    router.refresh();
  };

  const open = () => {
    setPin("");
    setPin2("");
    setError(null);
    setState(!vaultHasPin() ? "pin" : "confirm");
  };

  if (state === "idle") {
    return (
      <button
        type="button"
        title={t.privacy.hide}
        aria-label={t.privacy.hide}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          open();
        }}
        className="absolute end-2.5 top-2.5 z-10 grid size-8 place-items-center rounded-lg bg-surface/80 text-faint opacity-0 backdrop-blur transition hover:bg-surface-3 hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 max-md:opacity-60"
      >
        <MoreHorizontal className="size-4" />
      </button>
    );
  }

  return (
    <>
      {/* invisible anchor on the card; the modal lives at this position */}
      <span aria-hidden="true" />
      <Modal open onClose={() => setState("idle")} title={state === "pin" ? t.privacy.pinTitle : t.privacy.hide} subtitle={state === "pin" ? t.privacy.pinText : undefined}>
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
              <button type="button" className="btn btn-secondary flex-1" onClick={() => setState("idle")}>
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
    </>
  );
}

/**
 * The secret entrance: Settings → tap the app version 5 times quickly.
 * Asks for the device PIN when hidden chats exist, then lists them.
 */
export function VersionTap({ rooms }: { rooms: RoomBrief[] }) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [taps, setTaps] = useState(0);
  const [hint, setHint] = useState(false);
  const [stage, setStage] = useState<"closed" | "unlock" | "list">("closed");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => (tapTimer.current ? clearTimeout(tapTimer.current) : undefined), []);

  const tap = () => {
    if (tapTimer.current) clearTimeout(tapTimer.current);
    const next = taps + 1;
    if (next >= 5) {
      setTaps(0);
      openVault();
      return;
    }
    setTaps(next);
    tapTimer.current = setTimeout(() => setTaps(0), 1400);
  };

  const openVault = () => {
    setPin("");
    setError(null);
    const ids = hiddenRoomIds();
    setHiddenIds(ids);
    if (ids.length === 0) {
      setHint(true);
      setTimeout(() => setHint(false), 2200);
      return;
    }
    setStage(vaultHasPin() ? "unlock" : "list");
  };

  const byId = new Map(rooms.map((r) => [r.id, r.name]));

  return (
    <>
      <div className="mt-10 flex flex-col items-center gap-1 border-t border-line pt-6 pb-2 text-center">
        <button
          type="button"
          onClick={tap}
          className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-faint transition hover:text-muted"
          aria-label={`${APP_NAME} ${APP_VERSION}`}
          title={`${APP_NAME}`}
        >
          <PandaMark size={18} />
          <span dir="ltr">
            {APP_NAME} v{APP_VERSION}
          </span>
        </button>
        {hint ? <p className="pop-in text-[11px] text-muted">{t.privacy.hiddenHint}</p> : null}
        <p className="text-[10.5px] text-faint">
          {new Date().toLocaleDateString(lang === "fa" ? "fa-IR" : "en-US", { year: "numeric" })} · {APP_NAME}
        </p>
      </div>

      <Modal open={stage === "unlock"} onClose={() => setStage("closed")} title={t.privacy.unlockTitle} subtitle={t.privacy.unlockText}>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            if (await checkVaultPin(pin)) {
              setPin("");
              setStage("list");
            } else {
              setError(t.privacy.wrongPin);
            }
          }}
        >
          <input
            type="password"
            className="input"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder={t.privacy.pin}
            autoFocus
            autoComplete="off"
            dir="ltr"
          />
          {error ? <p className="notice notice-rose">{error}</p> : null}
          <button type="submit" className="btn btn-primary w-full">
            <KeyRound className="size-4" />
            {t.common.open}
          </button>
        </form>
      </Modal>

      <Modal open={stage === "list"} onClose={() => setStage("closed")} title={t.privacy.hiddenList}>
        <div className="space-y-2">
          {hiddenIds.length === 0 ? <p className="py-4 text-center text-sm text-muted">{t.privacy.noHidden}</p> : null}
          {hiddenIds.map((id) => (
            <div key={id} className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-3.5 py-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-3 text-accent-ink">
                <FolderLock className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-ink" dir="auto">
                  {byId.get(id) ?? t.privacy.deletedRoom}
                </p>
                <p className="text-[11px] text-muted">{t.privacy.hiddenBadge}</p>
              </div>
              {byId.has(id) ? (
                <Link
                  href={`/dashboard/rooms/${id}`}
                  className="btn btn-secondary btn-sm"
                  onClick={() => setStage("closed")}
                >
                  {t.common.open}
                </Link>
              ) : null}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  unhideRoom(id);
                  setHiddenIds((prev) => prev.filter((x) => x !== id));
                  router.refresh();
                }}
              >
                <ShieldCheck className="size-4" />
                {t.privacy.unhide}
              </button>
            </div>
          ))}
          {hiddenIds.length > 0 ? <p className="pt-2 text-center text-[11px] text-faint">{t.privacy.hiddenNote}</p> : null}
        </div>
      </Modal>
    </>
  );
}
