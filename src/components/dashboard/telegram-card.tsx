"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BellOff, Bot, ExternalLink, Lock, Send, Terminal, Unplug } from "lucide-react";
import { roomAction } from "@/app/actions/rooms";
import {
  savePlatformBotAction,
  startTelegramLinkAction,
  telegramAnnounceAction,
  telegramBotDmAction,
  telegramForwardAction,
  telegramOfflineNotifyAction,
  telegramPaidModeAction,
  telegramUnlinkAction,
} from "@/app/actions/telegram";
import { useI18n } from "@/components/i18n-provider";
import { ActionButton, ActionForm, CopyButton, SubmitButton } from "@/components/ui";
import { errorText } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type TelegramCardProps = {
  telegramEnabled: boolean;
  paid: boolean;
  allowed: boolean;
  botUsername: string | null;
  /** v1.6.0 — platform-owner surface: the official bot is configurable from the site */
  isOwner?: boolean;
  /** current official-bot state for the owner card */
  bot?: { configured: boolean; source: string; lastError: string | null; hint: string | null };
  link: {
    chatName: string;
    username: string | null;
    forwardEnabled: boolean;
    offlineNotify: boolean;
    announceEnabled?: boolean;
    allowBotDm: boolean;
    mutedRooms: Array<{ id: string; name: string }>;
  } | null;
  commands: Array<{ command: string; description: string }>;
};

/** Owner-only: the official platform bot, configurable from the site. */
function OwnerBotPanel({ telegramEnabled, paid, bot }: { telegramEnabled: boolean; paid: boolean; bot: NonNullable<TelegramCardProps["bot"]> }) {
  const { t } = useI18n();
  const [saveState, saveFormAction, saving] = useActionState(savePlatformBotAction, {});
  const [, paidFormAction] = useActionState(telegramPaidModeAction, {});

  return (
    <div className="mt-5 space-y-4 rounded-2xl border border-sky/40 bg-sky-soft/30 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-sky-soft text-sky-ink">
          <Bot className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-ink">{t.account.tgBotOwnerTitle}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">{t.account.tgBotOwnerHint}</p>
        </div>
        <span
          className={cn(
            "badge",
            bot.configured && !bot.lastError ? "badge-mint" : "bg-amber-soft text-amber-ink",
          )}
        >
          {bot.configured ? (bot.lastError ? t.account.tgBotErrorBadge : t.account.tgBotLiveBadge) : t.account.tgBotUnconfiguredBadge}
        </span>
      </div>

      {bot.lastError ? <p className="notice notice-rose">{bot.lastError}</p> : null}
      {bot.configured ? (
        <p className="font-mono text-xs text-muted" dir="ltr">
          {bot.hint} · {bot.source}
        </p>
      ) : null}

      <form action={saveFormAction} className="space-y-2">
        <input
          type="password"
          name="token"
          autoComplete="off"
          dir="ltr"
          placeholder="123456789:AA…"
          className="input font-mono text-xs"
          aria-label={t.account.tgBotTokenLabel}
        />
        {saveState.error ? (
          <p role="alert" className="notice notice-rose">
            {errorText(t, saveState.error)}
            {typeof saveState.data?.detail === "string" && saveState.data.detail ? <span dir="ltr"> — {saveState.data.detail}</span> : null}
          </p>
        ) : null}
        {saveState.ok ? <p className="notice notice-mint">{t.account.tgBotSaved}</p> : null}
        <SubmitButton className="btn btn-primary btn-sm" disabled={saving} aria-busy={saving}>
          <Send className="size-4" />
          {saving ? t.account.tgBotSaving : t.account.tgBotSave}
        </SubmitButton>
      </form>

      <ActionForm action={telegramPaidModeAction} showMessage={false} className="flex items-center justify-between gap-4">
        <input type="hidden" name="enabled" value={paid ? "0" : "1"} />
        <div>
          <p className="text-sm font-bold text-ink">{t.account.tgPaidModeTitle}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">{t.account.tgPaidModeHint}</p>
        </div>
        <SubmitButton className="rounded-full p-0.5" title={t.account.tgPaidModeTitle}>
          <span
            className={cn(
              "relative block h-[1.45rem] w-10 rounded-full transition",
              paid ? "bg-gradient-to-r from-accent to-accent-2" : "bg-line-strong",
            )}
          >
            <span
              className={cn(
                "absolute top-[3px] size-[calc(1.45rem-6px)] rounded-full bg-white shadow transition-all",
                paid ? "start-[calc(100%-1.45rem+3px)]" : "start-[3px]",
              )}
            />
          </span>
        </SubmitButton>
      </ActionForm>

      {!telegramEnabled ? <p className="notice notice-amber">{t.account.tgDisabledPlatform}</p> : null}
    </div>
  );
}

/** The glassy panel that pairs a Panda Chat account with the official Telegram bot. */
export function TelegramCard({ telegramEnabled, paid, allowed, botUsername, isOwner, bot, link, commands }: TelegramCardProps) {
  const { t } = useI18n();
  const router = useRouter();
  const [state, formAction, pending] = useActionState(startTelegramLinkAction, {});

  // While a fresh code is on screen, poll until the bot confirms the /start.
  useEffect(() => {
    if (!state.data?.url || link) return;
    const id = setInterval(() => router.refresh(), 4_000);
    return () => clearInterval(id);
  }, [state.data?.url, link, router]);

  // The platform owner is never locked out of their own bot by paid mode.
  const toggleDisabled = !telegramEnabled || (paid && !allowed && !isOwner);

  return (
    <section id="telegram" className="glass card scroll-mt-20 border-white/40 p-5 shadow-glass sm:p-6">
      <div className="flex flex-wrap items-center gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-[#2AABEE] to-[#229ED9] text-white shadow-soft">
          <Send className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="flex flex-wrap items-center gap-2 font-extrabold text-ink">
            {t.account.tgTitle}
            {paid ? (
              <span className="badge bg-amber-soft text-amber-ink">💎 {t.account.tgPremiumBadge}</span>
            ) : (
              <span className="badge badge-mint">{t.account.tgFreeBadge}</span>
            )}
          </h2>
          <p className="mt-1 text-sm text-muted">{t.account.tgSubtitle}</p>
        </div>
        {botUsername ? (
          <span className="rounded-xl border border-line bg-surface-2/70 px-3 py-1.5 font-mono text-xs text-ink-2" dir="ltr">
            @{botUsername}
          </span>
        ) : null}
      </div>

      {/* v1.6.0 — official-bot setup, owner only (the token never leaves the server unencrypted) */}
      {isOwner && bot ? <OwnerBotPanel telegramEnabled={telegramEnabled} paid={paid} bot={bot} /> : null}

      {!telegramEnabled ? (
        <p className="notice notice-amber mt-5">{t.account.tgDisabledPlatform}</p>
      ) : paid && !allowed && !isOwner ? (
        <div className="mt-5 rounded-2xl border border-amber/40 bg-amber-soft/60 p-5">
          <p className="flex items-center gap-2 font-extrabold text-amber-ink">
            <Lock className="size-4" />
            {t.account.tgPremiumTitle}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">{t.account.tgPremiumText}</p>
        </div>
      ) : !link ? (
        <div className="mt-5">
          {state.ok && typeof state.data?.url === "string" ? (
            <div className="pop-in space-y-4 rounded-2xl border border-line bg-surface-2/60 p-4">
              <p className="text-sm leading-relaxed text-ink-2">{t.account.tgPendingText}</p>
              <ol className="space-y-2 text-sm text-muted">
                <li className="flex gap-2">
                  <span className="font-extrabold text-accent-ink">1.</span>
                  <span>{t.account.tgPendingStep1}</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-extrabold text-accent-ink">2.</span>
                  <span>{t.account.tgPendingStep2}</span>
                </li>
              </ol>
              <div className="flex flex-wrap items-center gap-2">
                <a href={state.data.url} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm">
                  <ExternalLink className="size-4" />
                  {t.account.tgOpenBot}
                </a>
                <CopyButton value={state.data.url} className="btn btn-secondary btn-sm" />
              </div>
              <p className="flex items-center gap-2 text-xs text-faint">
                <span className="spinner" aria-hidden="true" />
                {t.account.tgWaiting}
              </p>
            </div>
          ) : (
            <form action={formAction} className="space-y-3">
              <p className="text-sm leading-relaxed text-muted">{t.account.tgConnectText}</p>
              {state.error ? (
                <p role="alert" className="notice notice-rose pop-in">
                  {errorText(t, state.error)}
                </p>
              ) : null}
              <button type="submit" className="btn btn-primary btn-sm" disabled={toggleDisabled || pending} aria-busy={pending}>
                {pending ? <span className="spinner" aria-hidden="true" /> : <Send className="size-4" />}
                {pending ? t.account.tgConnecting : t.account.tgConnect}
              </button>
            </form>
          )}
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-mint/40 bg-mint-soft/50 p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-mint-soft text-mint-ink">
              <Send className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-extrabold text-ink" dir="auto">
                {link.chatName}
              </p>
              <p className="truncate text-xs text-muted" dir="ltr">
                {link.username ? `@${link.username}` : t.account.tgLinkedHint}
              </p>
            </div>
            <span className="badge badge-mint">{t.account.tgLinkedBadge}</span>
          </div>

          <ActionForm action={telegramForwardAction} showMessage={false} className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-surface-2/50 p-4">
            <input type="hidden" name="enabled" value={link.forwardEnabled ? "0" : "1"} />
            <div>
              <p className="text-sm font-bold text-ink">{t.account.tgForward}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{t.account.tgForwardHint}</p>
            </div>
            <SubmitButton className="rounded-full p-0.5" title={t.account.tgForward}>
              <span
                className={cn(
                  "relative block h-[1.45rem] w-10 rounded-full transition",
                  link.forwardEnabled ? "bg-gradient-to-r from-accent to-accent-2" : "bg-line-strong",
                )}
              >
                <span
                  className={cn(
                    "absolute top-[3px] size-[calc(1.45rem-6px)] rounded-full bg-white shadow transition-all",
                    link.forwardEnabled ? "start-[calc(100%-1.45rem+3px)]" : "start-[3px]",
                  )}
                />
              </span>
            </SubmitButton>
          </ActionForm>

          <ActionForm action={telegramOfflineNotifyAction} showMessage={false} className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-surface-2/50 p-4">
            <input type="hidden" name="enabled" value={link.offlineNotify ? "0" : "1"} />
            <div>
              <p className="text-sm font-bold text-ink">{t.account.tgOfflineNotify}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{t.account.tgOfflineNotifyHint}</p>
            </div>
            <SubmitButton className="rounded-full p-0.5" title={t.account.tgOfflineNotify}>
              <span
                className={cn(
                  "relative block h-[1.45rem] w-10 rounded-full transition",
                  link.offlineNotify ? "bg-gradient-to-r from-accent to-accent-2" : "bg-line-strong",
                )}
              >
                <span
                  className={cn(
                    "absolute top-[3px] size-[calc(1.45rem-6px)] rounded-full bg-white shadow transition-all",
                    link.offlineNotify ? "start-[calc(100%-1.45rem+3px)]" : "start-[3px]",
                  )}
                />
              </span>
            </SubmitButton>
          </ActionForm>

          {/* v1.6.0 — platform announcements (اطلاع‌رسانی) as its own switch */}
          <ActionForm action={telegramAnnounceAction} showMessage={false} className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-surface-2/50 p-4">
            <input type="hidden" name="enabled" value={link.announceEnabled === false ? "1" : "0"} />
            <div>
              <p className="text-sm font-bold text-ink">{t.account.tgAnnounce}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{t.account.tgAnnounceHint}</p>
            </div>
            <SubmitButton className="rounded-full p-0.5" title={t.account.tgAnnounce}>
              <span
                className={cn(
                  "relative block h-[1.45rem] w-10 rounded-full transition",
                  link.announceEnabled !== false ? "bg-gradient-to-r from-accent to-accent-2" : "bg-line-strong",
                )}
              >
                <span
                  className={cn(
                    "absolute top-[3px] size-[calc(1.45rem-6px)] rounded-full bg-white shadow transition-all",
                    link.announceEnabled !== false ? "start-[calc(100%-1.45rem+3px)]" : "start-[3px]",
                  )}
                />
              </span>
            </SubmitButton>
          </ActionForm>

          <ActionForm action={telegramBotDmAction} showMessage={false} className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-surface-2/50 p-4">
            <input type="hidden" name="enabled" value={link.allowBotDm ? "0" : "1"} />
            <div>
              <p className="text-sm font-bold text-ink">{t.account.tgBotDm}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{t.account.tgBotDmHint}</p>
            </div>
            <SubmitButton className="rounded-full p-0.5" title={t.account.tgBotDm}>
              <span
                className={cn(
                  "relative block h-[1.45rem] w-10 rounded-full transition",
                  link.allowBotDm ? "bg-gradient-to-r from-accent to-accent-2" : "bg-line-strong",
                )}
              >
                <span
                  className={cn(
                    "absolute top-[3px] size-[calc(1.45rem-6px)] rounded-full bg-white shadow transition-all",
                    link.allowBotDm ? "start-[calc(100%-1.45rem+3px)]" : "start-[3px]",
                  )}
                />
              </span>
            </SubmitButton>
          </ActionForm>

          {link.mutedRooms.length > 0 ? (
            <div className="rounded-2xl border border-line bg-surface-2/50 p-4">
              <p className="flex items-center gap-2 text-sm font-bold text-ink">
                <BellOff className="size-4 text-muted" />
                {t.account.tgMutedRooms}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {link.mutedRooms.map((room) => (
                  <ActionButton
                    key={room.id}
                    action={roomAction}
                    fields={{ roomId: room.id, op: "tgMute" }}
                    className="btn btn-soft btn-sm"
                    title={t.account.tgUnmute}
                  >
                    <BellOff className="size-3.5" />
                    {room.name}
                  </ActionButton>
                ))}
              </div>
            </div>
          ) : null}

          <details className="rounded-2xl border border-line bg-surface-2/50 p-4">
            <summary className="flex cursor-pointer items-center gap-2 text-sm font-bold text-ink">
              <Terminal className="size-4 text-accent-ink" />
              {t.account.tgCommands}
            </summary>
            <ul className="mt-3 space-y-1.5" dir="ltr">
              {commands.map((c) => (
                <li key={c.command} className="flex items-baseline gap-2 text-xs">
                  <code className="shrink-0 rounded-md bg-accent-soft px-1.5 py-0.5 font-mono font-bold text-accent-ink">/{c.command}</code>
                  <span className="text-muted">{c.description}</span>
                </li>
              ))}
            </ul>
          </details>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <p className="text-xs text-faint">{t.account.tgManageInRooms}</p>
            <ActionButton action={telegramUnlinkAction} fields={{}} confirm={t.account.tgDisconnectConfirm} className="btn btn-danger btn-sm">
              <Unplug className="size-4" />
              {t.account.tgDisconnect}
            </ActionButton>
          </div>
        </div>
      )}
    </section>
  );
}
