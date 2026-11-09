"use client";

import { useActionState, useState } from "react";
import { KeyRound, ShieldCheck, ShieldX } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { errorText, tr } from "@/lib/i18n";
import { CopyButton } from "@/components/ui";
import { twoFactorConfirmAction, twoFactorDisableAction, twoFactorStartAction } from "@/app/actions/account";
import type { ActionState } from "@/lib/utils";

/**
 * Two-factor authentication enrollment & management.
 *
 * Flow: Start → server generates a PENDING TOTP secret → QR + manual secret →
 * user scans with any authenticator → Confirm with a live code → recovery codes
 * are shown EXACTLY ONCE → done. Disabling requires a valid code or an unused
 * recovery code.
 */
export function TwoFactorCard({ enabled }: { enabled: boolean }) {
  const { t } = useI18n();
  const [startState, startAction, startPending] = useActionState<ActionState, FormData>(twoFactorStartAction, {});
  const [confirmState, confirmAction, confirmPending] = useActionState<ActionState, FormData>(twoFactorConfirmAction, {});
  const [disableState, disableAction, disablePending] = useActionState<ActionState, FormData>(twoFactorDisableAction, {});
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [stage, setStage] = useState<"idle" | "enroll" | "codes">("idle");

  const secret = typeof startState.data?.secret === "string" ? startState.data.secret : null;
  const qrDataUrl = typeof startState.data?.qrDataUrl === "string" ? startState.data.qrDataUrl : null;
  const shownCodes = recoveryCodes ?? (Array.isArray(confirmState.data?.recoveryCodes) ? (confirmState.data.recoveryCodes as string[]) : null);

  return (
    <section className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-extrabold text-ink">
            <KeyRound className="size-4 text-accent-ink" />
            {t.twofactor.title}
          </h2>
          <p className="mt-1 max-w-xl text-sm text-muted">{t.twofactor.subtitle}</p>
        </div>
        <span className={`badge ${enabled ? "badge-mint" : "badge-neutral"}`}>
          {enabled ? t.twofactor.statusOn : t.twofactor.statusOff}
        </span>
      </div>

      {!enabled && stage === "idle" ? (
        <div className="mt-4">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setStage("enroll")}>
            <ShieldCheck className="size-4" />
            {t.twofactor.start}
          </button>
        </div>
      ) : null}

      {!enabled && stage === "enroll" ? (
        <div className="mt-5 space-y-4 rounded-2xl border border-line bg-surface-2/50 p-4">
          <form action={startAction}>
            <button type="submit" className="btn btn-secondary btn-sm" disabled={startPending}>
              {startPending ? <span className="spinner" aria-hidden="true" /> : <ShieldCheck className="size-4" />}
              {secret ? "↻ " : ""}
              {t.twofactor.scan}
            </button>
          </form>
          {startState.error ? <p className="notice notice-rose">{errorText(t, startState.error)}</p> : null}

          {qrDataUrl ? (
            <div className="flex flex-col items-center gap-3">
              <p className="text-sm font-bold text-ink">{t.twofactor.scan}</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrDataUrl} alt="TOTP QR code" width={220} height={220} className="rounded-xl border border-line bg-white p-2" />
              <p className="text-xs text-muted">{t.twofactor.scanHint}</p>
              <div className="flex items-center gap-2">
                <code className="rounded-lg bg-surface-3 px-3 py-1.5 font-mono text-xs text-ink" dir="ltr">
                  {secret}
                </code>
                <CopyButton value={secret ?? ""} className="btn btn-soft btn-sm" />
              </div>
              <form action={confirmAction} className="mt-2 w-full max-w-xs space-y-3">
                <label className="label" htmlFor="tf-code">
                  {t.twofactor.verify}
                </label>
                <input
                  id="tf-code"
                  name="code"
                  className="input text-center font-mono tracking-[0.3em]"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  required
                  autoFocus
                  dir="ltr"
                  placeholder="••••••"
                />
                {confirmState.error ? <p className="notice notice-rose">{errorText(t, confirmState.error)}</p> : null}
                <button type="submit" className="btn btn-primary w-full" disabled={confirmPending}>
                  {confirmPending ? <span className="spinner" aria-hidden="true" /> : null}
                  {t.twofactor.confirm}
                </button>
              </form>
            </div>
          ) : (
            <p className="text-xs leading-relaxed text-muted">{t.twofactor.verifyHint}</p>
          )}
        </div>
      ) : null}

      {shownCodes && shownCodes.length > 0 ? (
        <div className="mt-5 space-y-3 rounded-2xl border border-mint/40 bg-mint-soft/40 p-4">
          <p className="flex items-center gap-2 text-sm font-extrabold text-ink">
            <ShieldCheck className="size-4 text-mint-ink" />
            {t.twofactor.recoveryTitle}
          </p>
          <p className="text-xs leading-relaxed text-muted">{t.twofactor.recoveryText}</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {shownCodes.map((code) => (
              <code key={code} className="rounded-lg bg-surface px-2 py-1.5 text-center font-mono text-xs text-ink" dir="ltr">
                {code}
              </code>
            ))}
          </div>
          <div className="flex gap-2">
            <CopyButton value={shownCodes.join("\n")} className="btn btn-secondary btn-sm" />
            <button type="button" className="btn btn-soft btn-sm" onClick={() => setStage("idle")}>
              {t.common.close}
            </button>
          </div>
          <p className="text-xs font-bold text-mint-ink">{tr(t, "twofactor.enabled")}</p>
        </div>
      ) : null}

      {enabled ? (
        <div className="mt-5 space-y-3">
          <p className="notice notice-mint">{tr(t, "twofactor.enabled")}</p>
          <form action={disableAction} className="flex flex-col gap-3 rounded-2xl border border-line bg-surface-2/50 p-4 sm:flex-row sm:items-end">
            <div className="sm:flex-1">
              <label className="label" htmlFor="tf-disable-code">
                {t.twofactor.disableHint}
              </label>
              <input id="tf-disable-code" name="code" className="input font-mono" required dir="ltr" autoComplete="off" />
            </div>
            <button type="submit" className="btn btn-danger btn-sm" disabled={disablePending}>
              <ShieldX className="size-4" />
              {t.twofactor.disable}
            </button>
          </form>
          {disableState.error ? <p className="notice notice-rose">{errorText(t, disableState.error)}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
