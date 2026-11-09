"use client";

import { ArrowRight, LockKeyhole, LogOut, ShieldCheck, Unlock, Users } from "lucide-react";
import { joinRoomAction, leaveRoomAction, unlockRoomAction } from "@/app/actions/guest";
import { Avatar } from "@/components/brand";
import { useI18n } from "@/components/i18n-provider";
import { ActionButton, ActionForm, LangToggle, PasswordInput, SubmitButton, ThemeToggle } from "@/components/ui";
import { formatNumber } from "@/lib/i18n";
import { fmt } from "@/lib/utils";

export function GateForm({ token }: { token: string }) {
  const { t } = useI18n();
  return (
    <div className="card fade-up w-full max-w-md p-7 shadow-card sm:p-9">
      <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-accent-soft to-lavender-soft text-accent-ink shadow-soft">
        <LockKeyhole className="size-6" />
      </span>
      <h1 className="mt-5 text-center text-2xl font-extrabold text-ink">{t.invite.gateTitle}</h1>
      <p className="mt-2 text-center text-sm leading-relaxed text-muted">{t.invite.gateText}</p>
      <ActionForm action={unlockRoomAction} className="mt-7 space-y-4">
        <input type="hidden" name="token" value={token} />
        <div>
          <label className="label" htmlFor="room-password">
            {t.invite.gatePassword}
          </label>
          <PasswordInput id="room-password" name="password" autoComplete="off" />
        </div>
        <SubmitButton className="btn btn-primary btn-lg w-full">
          <Unlock className="size-4" />
          {t.invite.gateSubmit}
        </SubmitButton>
      </ActionForm>
      <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-muted">
        <ShieldCheck className="size-3.5 shrink-0 text-mint-ink" />
        {t.invite.secured}
      </p>
    </div>
  );
}

export function JoinForm({
  token,
  roomName,
  description,
  memberCount,
}: {
  token: string;
  roomName: string;
  description: string;
  memberCount: number;
}) {
  const { t, lang } = useI18n();
  return (
    <div className="card fade-up w-full max-w-md p-7 shadow-card sm:p-9">
      <div className="flex justify-center">
        <Avatar name={roomName} size={64} square className="shadow-card" />
      </div>
      <p className="mt-5 text-center text-xs font-extrabold uppercase tracking-[0.16em] text-accent-ink">{t.invite.joinKicker}</p>
      <h1 className="mt-1.5 text-center text-2xl font-extrabold text-ink" dir="auto">
        {roomName}
      </h1>
      {description ? (
        <p className="mt-2 text-center text-sm leading-relaxed text-muted" dir="auto">
          {description}
        </p>
      ) : null}
      <div className="mt-3 flex justify-center">
        <span className="badge badge-neutral">
          <Users className="size-3" />
          {fmt(memberCount === 1 ? t.invite.membersHereOne : t.invite.membersHere, { n: formatNumber(memberCount, lang) })}
        </span>
      </div>
      <p className="mt-6 border-t border-line pt-5 text-center text-sm text-ink-2">{t.invite.joinText}</p>
      <ActionForm action={joinRoomAction} className="mt-4 space-y-4">
        <input type="hidden" name="token" value={token} />
        <div>
          <label className="label" htmlFor="nickname">
            {t.invite.nickname}
          </label>
          <input
            id="nickname"
            name="nickname"
            className="input"
            required
            maxLength={24}
            autoComplete="nickname"
            dir="auto"
            placeholder={t.invite.nicknamePlaceholder}
          />
          <p className="hint">{t.invite.nicknameHint}</p>
        </div>
        <SubmitButton className="btn btn-primary btn-lg w-full">
          {t.invite.joinSubmit}
          <ArrowRight className="size-4 rtl:rotate-180" />
        </SubmitButton>
      </ActionForm>
    </div>
  );
}

export function GuestActions({ token, nickname }: { token: string; nickname: string }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-0.5">
      <span className="me-1 hidden items-center gap-2 rounded-full border border-line bg-surface-2 py-1 pe-3 ps-1 text-xs font-bold text-ink-2 md:inline-flex" title={fmt(t.chat.signedInAs, { name: nickname })}>
        <Avatar name={nickname} size={22} />
        <span className="max-w-28 truncate" dir="auto">
          {nickname}
        </span>
      </span>
      <LangToggle compact />
      <ThemeToggle />
      <ActionButton action={leaveRoomAction} fields={{ token }} confirm={t.chat.leaveConfirm} className="btn btn-ghost btn-sm h-10" title={t.chat.leave}>
        <LogOut className="size-4 rtl:-scale-x-100" />
        <span className="hidden sm:inline">{t.chat.leave}</span>
      </ActionButton>
    </div>
  );
}
