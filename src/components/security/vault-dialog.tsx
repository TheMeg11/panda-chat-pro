"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderLock, KeyRound, ShieldCheck } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { Modal } from "@/components/ui";
import {
  hiddenRoomIds,
  setPin as setVaultPin,
  unhideRoom,
  unlockVault,
  vaultHasPin,
} from "@/lib/vault";
import { logoutAction } from "@/app/actions/auth";

/** The chat list the vault shows — same shape the settings page already passes to VersionTap. */
export type RoomBrief = { id: string; name: string; kind?: string };

export type VaultDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rooms: RoomBrief[];
};

/**
 * The secret entrance gesture: 5 quick taps (reset window 1400ms) on whatever
 * surface mounts this hook — the version footer today, an About footer next.
 * Owns ONLY the counting and the dialog open state.
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
    tapTimer.current = setTimeout(() => setTaps(0), 1400);
  };

  return { onTap, open, setOpen };
}

/**
 * The hidden-chats vault modal — reusable footer guest (settings today, About next).
 *
 * Views:
 *  - no PIN yet            → PIN SETUP (create one, then unlock and list)
 *  - PIN set               → UNLOCK (existing flow, copied verbatim)
 *    · real PIN            → HIDDEN LIST (+ change-PIN entry, real mode only)
 *    · decoy PIN           → the identical, innocent "no hidden chats" state
 *    · decoy PIN + panic   → local wipe + session logout
 *
 * All vault state is device-local; the PIN never leaves this browser.
 */
export function VaultDialog(props: VaultDialogProps) {
  // Remount the flow tree whenever the dialog opens or closes, so every entry
  // starts from a pristine state without reset effects.
  return <VaultDialogSession key={props.open ? "open" : "closed"} {...props} />;
}

type Stage = "setup" | "unlock" | "list" | "change";

function VaultDialogSession({ open, onOpenChange, rooms }: VaultDialogProps) {
  const { t } = useI18n();
  const router = useRouter();
  // First view by PIN state, picked when the dialog session mounts (open === true).
  const [stage, setStage] = useState<Stage>(() => (vaultHasPin() ? "unlock" : "setup"));
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** transient success note shown once inside the list view (setup / change) */
  const [flash, setFlash] = useState<string | null>(null);
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  /** true only after a REAL-PIN unlock (or fresh setup) — decoy sessions never see the change-PIN affordance */
  const [realMode, setRealMode] = useState(false);

  const close = () => onOpenChange(false);

  const byId = new Map(rooms.map((r) => [r.id, r.name]));

  return (
    <>
      {/* -------------------------------------------------- PIN SETUP */}
      <Modal open={open && stage === "setup"} onClose={close} title={t.privacy.setupTitle} subtitle={t.privacy.setupText}>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            if (pin.length < 4) return setError(t.privacy.pinShort);
            if (pin !== pin2) return setError(t.privacy.pinMismatch);
            const value = pin;
            await setVaultPin(value);
            setPin("");
            setPin2("");
            // Replicate exactly what a successful unlock does (unlockVault →
            // sessionStorage mode "real") so hiddenRoomIds() works in this tab.
            await unlockVault(value);
            setRealMode(true);
            setHiddenIds(hiddenRoomIds());
            setFlash(t.privacy.setupSuccess);
            setStage("list");
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
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary flex-1" onClick={close}>
              {t.common.cancel}
            </button>
            <button type="submit" className="btn btn-primary flex-1">
              <KeyRound className="size-4" />
              {t.privacy.setupSubmit}
            </button>
          </div>
        </form>
      </Modal>

      {/* -------------------------------------------------- UNLOCK (existing flow) */}
      <Modal open={open && stage === "unlock"} onClose={close} title={t.privacy.unlockTitle} subtitle={t.privacy.unlockText}>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            const result = await unlockVault(pin);
            setPin("");
            if (!result) {
              setError(t.privacy.wrongPin);
              return;
            }
            if (result.panicked) {
              // Panic mode fired: the local vault is gone; lock the session too.
              close();
              await logoutAction();
              return;
            }
            // REAL pin → list the hidden chats. DECOY pin → an empty, ordinary
            // vault screen that is indistinguishable from "nothing is hidden".
            setRealMode(result.mode === "real");
            setHiddenIds(result.mode === "real" ? hiddenRoomIds() : []);
            setFlash(null);
            setStage("list");
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

      {/* -------------------------------------------------- HIDDEN LIST (existing rendering) */}
      <Modal open={open && stage === "list"} onClose={close} title={t.privacy.hiddenList}>
        <div className="space-y-2">
          {flash ? <p className="notice notice-mint pop-in">{flash}</p> : null}
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
                <Link href={`/dashboard/rooms/${id}`} className="btn btn-secondary btn-sm" onClick={() => close()}>
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
          {realMode ? (
            <button
              type="button"
              className="btn btn-soft btn-sm w-full"
              onClick={() => {
                setPin("");
                setPin2("");
                setError(null);
                setFlash(null);
                setStage("change");
              }}
            >
              <KeyRound className="size-4" />
              {t.privacy.changePin}
            </button>
          ) : null}
        </div>
      </Modal>

      {/* -------------------------------------------------- CHANGE PIN */}
      <Modal open={open && stage === "change"} onClose={close} title={t.privacy.changeTitle} subtitle={t.privacy.pinText}>
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            if (pin.length < 4) return setError(t.privacy.pinShort);
            if (pin !== pin2) return setError(t.privacy.pinMismatch);
            // Only the real-PIN hash is replaced; salt, hidden ids and any
            // decoy hash stay untouched — everything device-local, as always.
            await setVaultPin(pin);
            setPin("");
            setPin2("");
            setFlash(t.privacy.changeSuccess);
            setStage("list");
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
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-secondary flex-1"
              onClick={() => {
                setPin("");
                setPin2("");
                setError(null);
                setStage("list");
              }}
            >
              {t.common.back}
            </button>
            <button type="submit" className="btn btn-primary flex-1">
              <KeyRound className="size-4" />
              {t.privacy.changePin}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
