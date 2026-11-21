"use client";

/**
 * Privacy toolbox on the account page (v2.2.0):
 *  - Hidden-chats vault PIN — SERVER-side now: set / change the account PIN
 *    that locks the hidden-chats list (entry: About page → 5 taps on version).
 *    The old device-local decoy/panic modes are gone along with the
 *    localStorage vault — hiding is an account setting on every device.
 *  - Screenshot watermark toggle (stored locally),
 *  - Replay the onboarding tour.
 */

import { useEffect, useState } from "react";
import { EyeOff, FolderLock, ShieldAlert, Sparkles, Waves } from "lucide-react";
import {
  changeVaultPinAction,
  panicWipeAction,
  setDecoyPinAction,
  setPanicModeAction,
  setVaultPinAction,
  vaultStatusAction,
} from "@/app/actions/vault";
import { ReplayTutorialButton } from "@/components/tutorial/tutorial-gate";
import { useI18n } from "@/components/i18n-provider";
import { setLocalFlag, useLocalFlag } from "@/lib/local-store";
import { SubmitButton } from "@/components/ui";

const PIN_ERROR_KEYS = {
  wrongPin: "wrongPin",
  pinShort: "pinShort",
  pinMismatch: "pinMismatch",
  pinExists: "pinExists",
  noPin: "setupTitle",
} as const;

export function SecurityCard() {
  const { t } = useI18n();
  const watermark = useLocalFlag("pc-watermark");
  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  // v2.5.0 (B-01/B-02): decoy PIN + panic mode management
  const [decoyOpen, setDecoyOpen] = useState(false);
  const [panicOn, setPanicOn] = useState(false);
  const [panicBusy, setPanicBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const status = await vaultStatusAction();
      if (!cancelled) {
        setHasPin(status.hasPin);
        setPanicOn(Boolean(status.panicMode));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleWatermark = () => setLocalFlag("pc-watermark", !watermark);

  const errText = (code: string) => {
    if (code === "pinMatchesReal") return t.security.pinMatchesReal;
    const key = PIN_ERROR_KEYS[code as keyof typeof PIN_ERROR_KEYS];
    return key ? String(t.privacy[key as keyof typeof t.privacy]) : code;
  };

  const onSaved = () => {
    setError(null);
    setHasPin(true);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <section className="card p-5 sm:p-6" data-tutorial="security">
      <h2 className="flex items-center gap-2 font-extrabold text-ink">
        <FolderLock className="size-4 text-accent-ink" />
        {t.security.vaultTitle}
      </h2>
      <p className="mt-1 max-w-xl text-sm text-muted">{t.security.vaultText}</p>

      <div className="mt-5 space-y-4">
        {/* Vault PIN — server-side, set / change */}
        <div className="rounded-2xl border border-line bg-surface-2/50 p-4">
          <p className="flex items-center gap-1.5 text-sm font-bold text-ink">
            <EyeOff className="size-4 text-accent-ink" />
            {hasPin ? t.privacy.changeTitle : t.privacy.setupTitle}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">{t.privacy.setupText}</p>

          {hasPin === null ? null : hasPin ? (
            <form
              className="mt-3 flex flex-wrap items-center gap-2"
              onChange={() => setError(null)}
              onSubmit={async (e) => {
                e.preventDefault();
                setError(null);
                const fd = new FormData(e.currentTarget);
                const res = await changeVaultPinAction({}, fd);
                if (res?.ok) onSaved();
                else if (res?.error) setError(errText(res.error));
              }}
            >
              <input className="input h-10 w-32" type="password" name="oldPin" placeholder={t.privacy.pinCurrent} dir="ltr" autoComplete="current-password" required />
              <input className="input h-10 w-32" type="password" name="pin" placeholder={t.privacy.pinNew} dir="ltr" autoComplete="new-password" required />
              <input className="input h-10 w-32" type="password" name="pin2" placeholder={t.privacy.pinConfirm} dir="ltr" autoComplete="new-password" required />
              <SubmitButton className="btn btn-secondary btn-sm h-10">
                <EyeOff className="size-4" />
                {t.privacy.changeSubmit}
              </SubmitButton>
              {saved ? <span className="badge badge-mint">✓</span> : null}
            </form>
          ) : (
            <form
              className="mt-3 flex flex-wrap items-center gap-2"
              onChange={() => setError(null)}
              onSubmit={async (e) => {
                e.preventDefault();
                setError(null);
                const fd = new FormData(e.currentTarget);
                const res = await setVaultPinAction({}, fd);
                if (res?.ok) onSaved();
                else if (res?.error) setError(errText(res.error));
              }}
            >
              <input className="input h-10 w-32" type="password" name="pin" placeholder={t.privacy.pin} dir="ltr" autoComplete="new-password" required />
              <input className="input h-10 w-32" type="password" name="pin2" placeholder={t.privacy.pinConfirm} dir="ltr" autoComplete="new-password" required />
              <SubmitButton className="btn btn-secondary btn-sm h-10">
                <EyeOff className="size-4" />
                {t.privacy.setupSubmit}
              </SubmitButton>
              {saved ? <span className="badge badge-mint">✓</span> : null}
            </form>
          )}
          {error ? <p className="notice notice-rose mt-2">{error}</p> : null}
        </div>

        {/* v2.5.0 (B-01/B-02): decoy PIN + panic mode — the FAQ and the tour
            promise both; this is the management surface. Real PIN required. */}
        {hasPin ? (
          <div className="rounded-2xl border border-line bg-surface-2/50 p-4">
            <p className="flex items-center gap-1.5 text-sm font-bold text-ink">
              <ShieldAlert className="size-4 text-accent-ink" />
              {t.security.decoyPin}
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">{t.security.decoyPinHint}</p>

            {!decoyOpen ? (
              <button type="button" className="btn btn-secondary btn-sm mt-3" onClick={() => setDecoyOpen(true)}>
                {t.security.setDecoy}
              </button>
            ) : (
              <form
                className="mt-3 space-y-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setError(null);
                  const fd = new FormData(e.currentTarget);
                  const res = await setDecoyPinAction({}, fd);
                  if (res?.ok) {
                    setDecoyOpen(false);
                    setSaved(true);
                    setTimeout(() => setSaved(false), 2000);
                  } else if (res?.error) setError(errText(res.error));
                }}
              >
                <p className="text-xs text-muted">{t.security.decoyConfirmText}</p>
                <input className="input h-10 w-full sm:w-44" type="password" name="pin" placeholder={t.privacy.pinCurrent} dir="ltr" autoComplete="current-password" required />
                <input className="input h-10 w-full sm:w-44" type="password" name="decoyPin" placeholder={t.security.decoyPin} dir="ltr" autoComplete="new-password" required />
                <div className="flex flex-wrap gap-2">
                  <SubmitButton className="btn btn-secondary btn-sm h-10">{t.security.setDecoy}</SubmitButton>
                  <button
                    type="submit"
                    name="clear"
                    value="1"
                    className="btn btn-soft btn-sm h-10"
                    formNoValidate
                    onClick={(e) => {
                      // clear mode: only the real PIN is needed
                      const form = e.currentTarget.closest("form");
                      if (form) form.decoyPin.disabled = true;
                    }}
                  >
                    {t.security.clearDecoy}
                  </button>
                </div>
              </form>
            )}

            {/* Panic mode toggle */}
            <div className="mt-4 flex items-start justify-between gap-3 border-t border-line pt-3">
              <div>
                <p className="text-sm font-bold text-ink">{t.security.panic}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{t.security.panicHint}</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={panicOn}
                disabled={panicBusy}
                aria-label={t.security.panic}
                className={`relative block h-[1.45rem] w-10 shrink-0 rounded-full transition ${panicOn ? "bg-gradient-to-r from-rose to-rose-ink" : "bg-line-strong"}`}
                onClick={async () => {
                  setPanicBusy(true);
                  setError(null);
                  const pin = window.prompt(t.security.panicConfirmText);
                  if (pin === null) {
                    setPanicBusy(false);
                    return;
                  }
                  const fd = new FormData();
                  fd.set("pin", pin);
                  fd.set("enable", panicOn ? "0" : "1");
                  const res = await setPanicModeAction({}, fd);
                  if (res?.ok) {
                    setPanicOn(!panicOn);
                    setSaved(true);
                    setTimeout(() => setSaved(false), 2000);
                  } else if (res?.error) setError(errText(res.error));
                  setPanicBusy(false);
                }}
              >
                <span
                  className={`absolute top-[3px] size-[calc(1.45rem-6px)] rounded-full bg-white shadow transition-all ${panicOn ? "start-[calc(100%-1.45rem+3px)]" : "start-[3px]"}`}
                />
              </button>
            </div>

            {/* Panic wipe NOW */}
            <form
              className="mt-3"
              onSubmit={async (e) => {
                e.preventDefault();
                setError(null);
                const pin = window.prompt(t.security.panicConfirmText);
                if (pin === null) return;
                if (!window.confirm(t.security.wipeConfirm)) return;
                const fd = new FormData();
                fd.set("pin", pin);
                const res = await panicWipeAction({}, fd);
                if (res?.error) setError(errText(res.error));
              }}
            >
              <SubmitButton className="btn btn-soft btn-sm text-rose-ink">{t.security.panicWipe}</SubmitButton>
            </form>
            <p className="mt-1 text-[11px] leading-relaxed text-faint">{t.security.panicWipeHint}</p>
          </div>
        ) : null}

        {/* Watermark */}
        <div className="rounded-2xl border border-line bg-surface-2/50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-sm font-bold text-ink">
                <Waves className="size-4 text-accent-ink" />
                {t.security.watermark}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{t.security.watermarkHint}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={watermark}
              className={`relative block h-[1.45rem] w-10 shrink-0 rounded-full transition ${watermark ? "bg-gradient-to-r from-accent to-accent-2" : "bg-line-strong"}`}
              onClick={toggleWatermark}
            >
              <span
                className={`absolute top-[3px] size-[calc(1.45rem-6px)] rounded-full bg-white shadow transition-all ${watermark ? "start-[calc(100%-1.45rem+3px)]" : "start-[3px]"}`}
              />
            </button>
          </div>
        </div>

        {/* Tutorial replay */}
        <div className="flex flex-wrap items-center gap-2">
          <ReplayTutorialButton />
        </div>
        <p className="text-[11px] leading-relaxed text-faint">
          <Sparkles className="me-1 inline size-3" />
          {t.security.newDeviceNotice}
        </p>
      </div>
    </section>
  );
}
