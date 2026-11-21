"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { login2faAction, loginAction, registerAction } from "@/app/actions/auth";
import { confirmPasswordResetAction } from "@/app/actions/password-reset";
import { useI18n } from "./i18n-provider";
import { errorText, tr } from "@/lib/i18n";
import { ActionForm, PasswordInput, SubmitButton } from "./ui";
import type { ActionState } from "@/lib/utils";

/**
 * v1.8.0 — built-in math CAPTCHA for the register form. A fresh challenge is
 * fetched from /api/register/captcha (locale-aware digits); the signed token
 * and the user's answer travel with the form and are verified server-side.
 */
function CaptchaField() {
  const { t } = useI18n();
  const [challenge, setChallenge] = useState<{ question: string; token: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    // Re-run the fetch effect by reusing the same loader logic inline.
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch("/api/register/captcha", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { question: string; token: string };
        setChallenge(data);
      } catch {
        /* offline — keep the previous challenge */
      } finally {
        setLoading(false);
      }
    })();
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/register/captcha", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { question: string; token: string };
        if (!cancelled) setChallenge(data);
      } catch {
        /* offline — the field stays in its loading state */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <label className="label" htmlFor="captcha-answer">
        {t.auth.captchaLabel}
      </label>
      <div className="flex items-center gap-2">
        <span
          className="flex h-10 min-w-24 select-none items-center justify-center rounded-xl border border-line bg-surface-2 px-3 font-mono text-base font-extrabold tracking-widest text-ink"
          dir="ltr"
          aria-live="polite"
        >
          {loading || !challenge ? "…" : challenge.question}
        </span>
        <input
          id="captcha-answer"
          name="captchaAnswer"
          className="input h-10 flex-1"
          inputMode="numeric"
          autoComplete="off"
          required
          maxLength={4}
          dir="ltr"
          placeholder={t.auth.captchaPlaceholder}
          aria-label={t.auth.captchaLabel}
        />
        <button
          type="button"
          onClick={load}
          className="btn btn-ghost btn-icon h-10 w-10 shrink-0"
          aria-label={t.auth.captchaRefresh}
          title={t.auth.captchaRefresh}
          disabled={loading}
        >
          <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
        </button>
      </div>
      {/* the signed token rides along hidden — verified server-side */}
      <input type="hidden" name="captchaToken" value={challenge?.token ?? ""} />
      <p className="hint">{t.auth.captchaHint}</p>
    </div>
  );
}

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
        <p className="mt-3 text-center text-sm">
          <Link href="/forgot-password" className="text-accent-ink hover:underline">
            {t.auth.forgot}
          </Link>
        </p>
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

/**
 * Password recovery with a SIGNUP RECOVERY CODE (web-only, v2.6.0).
 *
 * One single step: username + one of the 10 one-time codes shown at signup
 * + a fresh password. On success every session of the account is revoked.
 */
export function ForgotPasswordForm() {
  const { t } = useI18n();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(confirmPasswordResetAction, {});

  if (state.ok) {
    return (
      <>
        <p role="status" className="notice notice-mint pop-in">
          {tr(t, state.message)}
        </p>
        <Link href="/login" className="btn btn-primary btn-lg mt-5 w-full">
          {t.auth.submitLogin}
        </Link>
      </>
    );
  }

  return (
    <>
      <form action={formAction} className="space-y-5">
        <div>
          <label className="label" htmlFor="reset-username">
            {t.auth.username}
          </label>
          <input
            id="reset-username"
            name="username"
            className="input"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            required
            minLength={3}
            maxLength={32}
            pattern="[A-Za-z0-9_.]{3,32}"
            dir="ltr"
            placeholder={t.auth.usernamePlaceholder}
          />
          <p className="hint">{t.auth.usernameHint}</p>
        </div>
        <div>
          <label className="label" htmlFor="resetCode">
            {t.auth.resetCode}
          </label>
          <input
            id="resetCode"
            name="code"
            className="input text-center font-mono tracking-[0.12em]"
            autoComplete="one-time-code"
            required
            autoFocus
            dir="ltr"
            placeholder={t.auth.resetCodePlaceholder}
          />
          <p className="hint">{t.auth.resetCodeHint}</p>
        </div>
        <div>
          <label className="label" htmlFor="newPassword">
            {t.auth.resetNewPassword}
          </label>
          <PasswordInput name="newPassword" autoComplete="new-password" minLength={8} />
          <p className="hint">{t.auth.passwordHint}</p>
        </div>
        <div>
          <label className="label" htmlFor="confirm">
            {t.auth.confirmPassword}
          </label>
          <PasswordInput name="confirm" autoComplete="new-password" minLength={8} />
        </div>
        {state.error ? (
          <p role="alert" className="notice notice-rose pop-in">
            {errorText(t, state.error)}
          </p>
        ) : null}
        <button type="submit" className="btn btn-primary btn-lg w-full" disabled={pending} aria-busy={pending}>
          {pending ? <span className="spinner" aria-hidden="true" /> : null}
          {t.auth.resetConfirmSubmit}
        </button>
      </form>
      <p className="mt-7 text-center text-sm text-muted">
        {t.auth.haveAccount}{" "}
        <Link href="/login" className="font-bold text-accent-ink hover:underline">
          {t.auth.loginInstead}
        </Link>
      </p>
    </>
  );
}

export function RegisterForm() {
  const { t } = useI18n();
  // v2.5.0 (B-06): native minLength validation fails SILENTLY in embedded
  // browsers and some automation contexts (no bubble, no network request —
  // the button just does nothing). Validate in JS and show the reason under
  // the field so a short password is never a dead click.
  const [pwError, setPwError] = useState<string | null>(null);
  const pwRef = useRef<HTMLInputElement | null>(null);
  const confirmRef = useRef<HTMLInputElement | null>(null);
  const checkPassword = (form: HTMLFormElement): boolean => {
    const pw = form.querySelector<HTMLInputElement>("input[name=password]");
    const cf = form.querySelector<HTMLInputElement>("input[name=confirm]");
    if (pw && pw.value.length > 0 && pw.value.length < 8) {
      setPwError(t.errors.passwordShort);
      pw.focus();
      return false;
    }
    if (pw && cf && cf.value.length > 0 && pw.value !== cf.value) {
      setPwError(t.errors.passwordMismatch);
      cf.focus();
      return false;
    }
    setPwError(null);
    return true;
  };
  return (
    <>
      <ActionForm
        action={registerAction}
        className="space-y-5"
        onSubmitHook={checkPassword}
      >
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
        {pwError ? (
          <p role="alert" className="notice notice-rose -mt-2">
            {pwError}
          </p>
        ) : null}
        <CaptchaField />
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
