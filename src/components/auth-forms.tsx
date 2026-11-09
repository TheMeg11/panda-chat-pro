"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { login2faAction, loginAction, registerAction } from "@/app/actions/auth";
import { useI18n } from "./i18n-provider";
import { errorText } from "@/lib/i18n";
import { ActionForm, PasswordInput, SubmitButton } from "./ui";
import type { ActionState } from "@/lib/utils";

function RememberMe() {
  const { t } = useI18n();
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface-2 p-3.5 transition hover:border-line-strong">
      <input type="checkbox" name="remember" className="checkbox mt-0.5" />
      <span>
        <span className="block text-sm font-bold text-ink">{t.auth.remember}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted">{t.auth.rememberHint}</span>
      </span>
    </label>
  );
}

/**
 * Login with an optional TWO-FACTOR step: when the account has 2FA enabled,
 * the password check returns a short-lived pre-auth token and this form swaps
 * to the verification-code step instead of signing in directly.
 */
export function LoginForm() {
  const { t } = useI18n();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(loginAction, {});
  const [state2, formAction2, pending2] = useActionState<ActionState, FormData>(login2faAction, {});
  const [remember, setRemember] = useState(false);
  const preAuthToken = typeof state.data?.preAuthToken === "string" ? state.data.preAuthToken : null;
  const in2faStep = Boolean(state.ok && preAuthToken);

  if (in2faStep) {
    return (
      <form action={formAction2} className="space-y-5">
        <div className="rounded-2xl border border-line bg-surface-2/60 p-4 text-center">
          <p className="text-sm font-extrabold text-ink">{t.twofactor.loginTitle}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">{t.twofactor.loginText}</p>
        </div>
        <input type="hidden" name="preAuthToken" value={preAuthToken ?? ""} />
        <input type="hidden" name="remember" value={remember ? "on" : ""} />
        <div>
          <label className="label" htmlFor="code">
            {t.twofactor.loginCode}
          </label>
          <input
            id="code"
            name="code"
            className="input text-center font-mono text-lg tracking-[0.3em]"
            autoComplete="one-time-code"
            inputMode="numeric"
            pattern="[0-9A-Za-z-]{6,12}"
            maxLength={12}
            required
            autoFocus
            dir="ltr"
            placeholder="••••••"
          />
        </div>
        {state2.error ? (
          <p role="alert" className="notice notice-rose pop-in">
            {errorText(t, state2.error)}
          </p>
        ) : null}
        <button type="submit" className="btn btn-primary btn-lg w-full" disabled={pending2} aria-busy={pending2}>
          {pending2 ? <span className="spinner" aria-hidden="true" /> : null}
          {t.auth.submitLogin}
        </button>
      </form>
    );
  }

  return (
    <>
      <form action={formAction} className="space-y-5">
        <div>
          <label className="label" htmlFor="username">
            {t.auth.username}
          </label>
          <input
            id="username"
            name="username"
            className="input"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            dir="ltr"
            placeholder={t.auth.usernamePlaceholder}
          />
        </div>
        <div>
          <label className="label" htmlFor="password">
            {t.auth.password}
          </label>
          <PasswordInput name="password" autoComplete="current-password" />
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface-2 p-3.5 transition hover:border-line-strong">
          <input
            type="checkbox"
            name="remember"
            className="checkbox mt-0.5"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
          <span>
            <span className="block text-sm font-bold text-ink">{t.auth.remember}</span>
            <span className="mt-0.5 block text-xs leading-relaxed text-muted">{t.auth.rememberHint}</span>
          </span>
        </label>
        {state.error ? (
          <p role="alert" className="notice notice-rose pop-in">
            {errorText(t, state.error)}
          </p>
        ) : null}
        <button type="submit" className="btn btn-primary btn-lg w-full" disabled={pending} aria-busy={pending}>
          {pending ? <span className="spinner" aria-hidden="true" /> : null}
          {t.auth.submitLogin}
        </button>
      </form>
      <p className="mt-7 text-center text-sm text-muted">
        {t.auth.noAccount}{" "}
        <Link href="/register" className="font-bold text-accent-ink hover:underline">
          {t.auth.createOne}
        </Link>
      </p>
    </>
  );
}

export function RegisterForm() {
  const { t } = useI18n();
  return (
    <>
      <ActionForm action={registerAction} className="space-y-5">
        <div>
          <label className="label" htmlFor="displayName">
            {t.auth.displayName}
          </label>
          <input
            id="displayName"
            name="displayName"
            className="input"
            autoComplete="nickname"
            required
            maxLength={40}
            placeholder={t.auth.displayNamePlaceholder}
          />
          <p className="hint">{t.auth.displayNameHint}</p>
        </div>
        <div>
          <label className="label" htmlFor="username">
            {t.auth.username}
          </label>
          <input
            id="username"
            name="username"
            className="input"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            minLength={3}
            maxLength={24}
            pattern="[A-Za-z0-9_.]{3,24}"
            dir="ltr"
            placeholder={t.auth.usernamePlaceholder}
          />
          <p className="hint">{t.auth.usernameHint}</p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="password">
              {t.auth.password}
            </label>
            <PasswordInput name="password" autoComplete="new-password" minLength={8} />
          </div>
          <div>
            <label className="label" htmlFor="confirm">
              {t.auth.confirmPassword}
            </label>
            <PasswordInput name="confirm" autoComplete="new-password" minLength={8} />
          </div>
        </div>
        <p className="hint -mt-2">{t.auth.passwordHint}</p>
        <RememberMe />
        <SubmitButton className="btn btn-primary btn-lg w-full">{t.auth.submitRegister}</SubmitButton>
      </ActionForm>
      <p className="mt-7 text-center text-sm text-muted">
        {t.auth.haveAccount}{" "}
        <Link href="/login" className="font-bold text-accent-ink hover:underline">
          {t.auth.loginInstead}
        </Link>
      </p>
    </>
  );
}
