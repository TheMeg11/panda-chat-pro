"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { EyeOff, MoreHorizontal } from "lucide-react";
import { PandaMark } from "@/components/brand";
import { useI18n } from "@/components/i18n-provider";
import { Modal } from "@/components/ui";
import { APP_NAME, APP_VERSION } from "@/lib/version";
import { hiddenRoomIds, hideRoom, setPin as setVaultPin, vaultHasPin } from "@/lib/vault";
import { useVersionTap, VaultDialog, type RoomBrief } from "@/components/security/vault-dialog";

/** @deprecated import from "@/components/security/vault-dialog" — kept for the existing public surface. */
export type { RoomBrief };
export { useVersionTap, VaultDialog };

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
