"use client";

import { useState } from "react";
import { EyeOff, FolderLock, Sparkles, TriangleAlert, Waves } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { ReplayTutorialButton } from "@/components/tutorial/tutorial-gate";
import { setLocalFlag, useLocalFlag, useLocalJson, notifyLocalStore } from "@/lib/local-store";
import { panicClearVault, setDecoyPin, setPanicMode, type Vault } from "@/lib/vault";

/**
 * Privacy toolbox on the account page:
 *  - Decoy PIN (a second PIN that opens an EMPTY vault),
 *  - Panic mode (decoy PIN wipes the vault + locks the session),
 *  - Emergency local wipe,
 *  - Screenshot watermark toggle (stored locally),
 *  - Replay the onboarding tour.
 * All vault state is device-local; nothing here ever leaves the browser.
 */
export function SecurityCard() {
  const { t } = useI18n();
  const vault = useLocalJson<Vault>("pc-vault");
  const watermark = useLocalFlag("pc-watermark");
  const [decoyPin, setDecoyPinValue] = useState("");
  const [decoyPin2, setDecoyPinValue2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const hasPin = Boolean(vault?.h);
  const decoy = Boolean(vault?.d);
  const panic = Boolean(vault?.panic);

  const toggleWatermark = () => setLocalFlag("pc-watermark", !watermark);

  return (
    <section className="card p-5 sm:p-6" data-tutorial="security">
      <h2 className="flex items-center gap-2 font-extrabold text-ink">
        <FolderLock className="size-4 text-accent-ink" />
        {t.security.vaultTitle}
      </h2>
      <p className="mt-1 max-w-xl text-sm text-muted">{t.security.vaultText}</p>

      <div className="mt-5 space-y-4">
        {/* Decoy PIN */}
        <div className="rounded-2xl border border-line bg-surface-2/50 p-4">
          <p className="text-sm font-bold text-ink">{t.security.decoyPin}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">{t.security.decoyPinHint}</p>
          {hasPin ? (
            decoy ? (
              <button
                type="button"
                className="btn btn-soft btn-sm mt-3"
                onClick={async () => {
                  await setDecoyPin(null);
                  notifyLocalStore();
                }}
              >
                {t.security.clearDecoy}
              </button>
            ) : (
              <form
                className="mt-3 flex flex-wrap items-center gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setError(null);
                  if (decoyPin.length < 4) return setError(t.privacy.pinShort);
                  if (decoyPin !== decoyPin2) return setError(t.privacy.pinMismatch);
                  await setDecoyPin(decoyPin);
                  setDecoyPinValue("");
                  setDecoyPinValue2("");
                  notifyLocalStore();
                  setSaved(true);
                  setTimeout(() => setSaved(false), 2000);
                }}
              >
                <input
                  type="password"
                  className="input h-10 w-32"
                  value={decoyPin}
                  onChange={(e) => setDecoyPinValue(e.target.value)}
                  placeholder={t.privacy.pin}
                  dir="ltr"
                  autoComplete="new-password"
                />
                <input
                  type="password"
                  className="input h-10 w-32"
                  value={decoyPin2}
                  onChange={(e) => setDecoyPinValue2(e.target.value)}
                  placeholder={t.privacy.pinConfirm}
                  dir="ltr"
                  autoComplete="new-password"
                />
                <button type="submit" className="btn btn-secondary btn-sm h-10">
                  <EyeOff className="size-4" />
                  {t.security.setDecoy}
                </button>
                {saved ? <span className="badge badge-mint">✓</span> : null}
              </form>
            )
          ) : (
            <p className="mt-2 text-xs text-faint">
              {t.privacy.pinTitle} — {t.privacy.pinText}
            </p>
          )}
          {error ? <p className="notice notice-rose mt-2">{error}</p> : null}
        </div>

        {/* Panic mode */}
        <div className="rounded-2xl border border-line bg-surface-2/50 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-ink">{t.security.panic}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{t.security.panicHint}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={panic}
              disabled={!decoy}
              className={`relative block h-[1.45rem] w-10 shrink-0 rounded-full transition ${panic ? "bg-gradient-to-r from-rose to-rose-2" : "bg-line-strong"} ${!decoy ? "opacity-40" : ""}`}
              onClick={() => {
                setPanicMode(!panic);
                notifyLocalStore();
              }}
            >
              <span
                className={`absolute top-[3px] size-[calc(1.45rem-6px)] rounded-full bg-white shadow transition-all ${panic ? "start-[calc(100%-1.45rem+3px)]" : "start-[3px]"}`}
              />
            </button>
          </div>
        </div>

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

        {/* Panic wipe + tutorial replay */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-danger btn-sm"
            onClick={() => {
              if (!window.confirm(t.common.confirm)) return;
              panicClearVault();
              notifyLocalStore();
            }}
          >
            <TriangleAlert className="size-4" />
            {t.security.panicWipe}
          </button>
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
