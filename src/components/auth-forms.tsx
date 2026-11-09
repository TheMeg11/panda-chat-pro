"use client";

import Link from "next/link";
import { loginAction, registerAction } from "@/app/actions/auth";
import { useI18n } from "./i18n-provider";
import { ActionForm, PasswordInput, SubmitButton } from "./ui";

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

export function LoginForm() {
  const { t } = useI18n();
  return (
    <>
      <ActionForm action={loginAction} className="space-y-5">
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
        <RememberMe />
        <SubmitButton className="btn btn-primary btn-lg w-full">{t.auth.submitLogin}</SubmitButton>
      </ActionForm>
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
