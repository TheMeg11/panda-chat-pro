"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Ban,
  ChevronLeft,
  ExternalLink,
  KeyRound,
  Link2,
  Lock,
  LockOpen,
  MessageCircle,
  PencilLine,
  RefreshCw,
  Send,
  Settings2,
  ShieldCheck,
  Terminal,
  TriangleAlert,
  UserCheck,
  Users,
  UserX,
  Zap,
} from "lucide-react";
import { roomAction } from "@/app/actions/rooms";
import { Avatar } from "@/components/brand";
import { ChatView } from "@/components/chat/chat-view";
import { useI18n } from "@/components/i18n-provider";
import { ActionButton, ActionForm, CopyButton, LocalTime, PasswordInput, SubmitButton, useNow } from "@/components/ui";
import type { ChatSnapshot } from "@/lib/chat";
import { formatNumber } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export type WorkspaceRoom = {
  id: string;
  name: string;
  description: string;
  inviteUrl: string;
  hasPassword: boolean;
  isLocked: boolean;
  isDisabled: boolean;
};
export type WorkspaceMember = { id: string; shortId: string; nickname: string; status: string; lastSeenAt: string };
export type WorkspaceTelegram = {
  platformEnabled: boolean;
  paid: boolean;
  allowed: boolean;
  linked: boolean;
  chatName: string | null;
  muted: boolean;
};

type Tab = "share" | "security" | "telegram" | "members" | "settings";

type Props = {
  room: WorkspaceRoom;
  snapshot: ChatSnapshot;
  members: WorkspaceMember[];
  telegram: WorkspaceTelegram;
  maxLength: number;
  commands: Array<{ command: string; description: string }>;
};

export function RoomWorkspace(props: Props) {
  const { room, snapshot, maxLength } = props;
  const { t } = useI18n();
  const [view, setView] = useState<"chat" | "manage">("chat");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-3 py-2 lg:hidden">
        <Link href="/dashboard" className="btn btn-ghost btn-icon btn-sm" aria-label={t.room.allRooms}>
          <ChevronLeft className="size-4 rtl:rotate-180" />
        </Link>
        <div className="seg flex-1">
          <button type="button" data-active={view === "chat"} className="seg-item flex-1" onClick={() => setView("chat")}>
            <MessageCircle className="size-4" />
            {t.room.chatTab}
          </button>
          <button type="button" data-active={view === "manage"} className="seg-item flex-1" onClick={() => setView("manage")}>
            <Settings2 className="size-4" />
            {t.room.manageTab}
          </button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <section className={cn("min-w-0 flex-1 flex-col", view === "chat" ? "flex" : "hidden", "lg:flex")}>
          {room.isDisabled ? (
            <div className="grid h-full place-items-center p-6">
              <div className="card max-w-md p-8 text-center">
                <span className="icon-tile mx-auto bg-rose-soft text-rose-ink">
                  <Ban className="size-5" />
                </span>
                <p className="mt-4 text-sm leading-relaxed text-ink-2">{t.room.disabledByAdmin}</p>
              </div>
            </div>
          ) : (
            <ChatView
              endpoint={`/api/rooms/${room.id}/messages`}
              initial={snapshot}
              maxLength={maxLength}
              headerStart={
                <Link href="/dashboard" className="btn btn-ghost btn-icon btn-sm -ms-1 hidden lg:inline-flex" aria-label={t.room.allRooms} title={t.room.allRooms}>
                  <ChevronLeft className="size-4 rtl:rotate-180" />
                </Link>
              }
            />
          )}
        </section>
        <aside
          className={cn(
            "w-full shrink-0 flex-col border-line bg-surface lg:w-[400px] lg:border-s xl:w-[430px]",
            view === "manage" ? "flex" : "hidden",
            "lg:flex",
          )}
        >
          <RoomManager {...props} />
        </aside>
      </div>
    </div>
  );
}

function PanelTitle({
  icon: Icon,
  title,
  aside,
  tone = "accent",
}: {
  icon: LucideIcon;
  title: string;
  aside?: ReactNode;
  tone?: "accent" | "rose" | "sky" | "mint" | "amber";
}) {
  const tones = {
    accent: "bg-accent-soft text-accent-ink",
    rose: "bg-rose-soft text-rose-ink",
    sky: "bg-sky-soft text-sky-ink",
    mint: "bg-mint-soft text-mint-ink",
    amber: "bg-amber-soft text-amber-ink",
  };
  return (
    <div className="flex items-center gap-3">
      <span className={cn("grid size-9 shrink-0 place-items-center rounded-xl", tones[tone])}>
        <Icon className="size-[18px]" />
      </span>
      <h3 className="min-w-0 flex-1 font-extrabold text-ink">{title}</h3>
      {aside}
    </div>
  );
}

function Hidden({ roomId, op }: { roomId: string; op: string }) {
  return (
    <>
      <input type="hidden" name="roomId" value={roomId} />
      <input type="hidden" name="op" value={op} />
    </>
  );
}

function RoomManager({ room, members, telegram, commands }: Props) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const now = useNow();
  const [tab, setTab] = useState<Tab>("share");

  useEffect(() => {
    if (tab !== "members") return;
    router.refresh();
    const id = setInterval(() => router.refresh(), 20_000);
    return () => clearInterval(id);
  }, [tab, router]);

  const tabs: Array<[Tab, LucideIcon, string]> = [
    ["share", Link2, t.room.tabShare],
    ["security", ShieldCheck, t.room.tabSecurity],
    ["telegram", Send, t.room.tabTelegram],
    ["members", Users, t.room.tabMembers],
    ["settings", Settings2, t.room.tabSettings],
  ];
  const fields = (op: string, extra: Record<string, string> = {}) => ({ roomId: room.id, op, ...extra });
  const activeMembers = members.filter((m) => m.status === "active").length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-line p-3 sm:p-4">
        <div className="grid grid-cols-5 gap-1 rounded-xl border border-line bg-surface-3 p-1" role="tablist">
          {tabs.map(([key, Icon, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              data-active={tab === key}
              onClick={() => setTab(key)}
              className="flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-[11px] font-bold text-muted transition hover:text-ink data-[active=true]:bg-surface data-[active=true]:text-ink data-[active=true]:shadow-soft"
            >
              <Icon className="size-4" />
              <span className="max-w-full truncate">{label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 sm:p-4">
        {tab === "share" ? (
          <section className="card p-5">
            <PanelTitle icon={Link2} title={t.room.inviteTitle} />
            <p className="mt-2 text-sm leading-relaxed text-muted">{t.room.inviteText}</p>
            <div className="mt-4 break-all rounded-xl border border-line bg-surface-2 p-3 font-mono text-xs leading-relaxed text-ink-2" dir="ltr">
              {room.inviteUrl}
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-mint-ink">
              <ShieldCheck className="size-3.5" />
              {t.room.tokenStrength}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <CopyButton value={room.inviteUrl} className="btn btn-primary btn-sm" />
              <ActionButton action={roomAction} fields={fields("rotate")} confirm={t.room.rotateConfirm} className="btn btn-soft btn-sm">
                <RefreshCw className="size-4" />
                {t.room.rotate}
              </ActionButton>
            </div>
          </section>
        ) : null}

        {tab === "security" ? (
          <>
            <section className="card p-5">
              <PanelTitle
                icon={KeyRound}
                title={t.room.passwordTitle}
                aside={
                  room.hasPassword ? (
                    <span className="badge badge-mint">{t.room.passwordOn}</span>
                  ) : (
                    <span className="badge badge-neutral">{t.room.passwordOff}</span>
                  )
                }
              />
              <p className="mt-2 text-sm leading-relaxed text-muted">{t.room.passwordText}</p>
              <ActionForm action={roomAction} resetOnSuccess className="mt-4 space-y-3">
                <Hidden roomId={room.id} op="password" />
                <div>
                  <label className="label" htmlFor="new-room-password">
                    {t.room.newPassword}
                  </label>
                  <PasswordInput id="new-room-password" name="password" autoComplete="new-password" minLength={4} />
                </div>
                <SubmitButton className="btn btn-primary btn-sm">{room.hasPassword ? t.room.changePassword : t.room.setPassword}</SubmitButton>
              </ActionForm>
              {room.hasPassword ? (
                <div className="mt-4 border-t border-line pt-4">
                  <ActionButton action={roomAction} fields={fields("removePassword")} confirm={t.room.removePasswordConfirm} className="btn btn-danger btn-sm">
                    <LockOpen className="size-4" />
                    {t.room.removePassword}
                  </ActionButton>
                </div>
              ) : null}
            </section>
            <section className="card p-5">
              <PanelTitle
                icon={Lock}
                tone="amber"
                title={t.room.lockTitle}
                aside={
                  room.isLocked ? (
                    <span className="badge badge-amber">{t.room.lockedNow}</span>
                  ) : (
                    <span className="badge badge-mint">{t.room.unlockedNow}</span>
                  )
                }
              />
              <p className="mt-2 text-sm leading-relaxed text-muted">{t.room.lockText}</p>
              <div className="mt-4">
                <ActionButton action={roomAction} fields={fields(room.isLocked ? "unlock" : "lock")} className="btn btn-secondary btn-sm">
                  {room.isLocked ? <LockOpen className="size-4" /> : <Lock className="size-4" />}
                  {room.isLocked ? t.room.unlock : t.room.lock}
                </ActionButton>
              </div>
            </section>
          </>
        ) : null}

        {tab === "telegram" ? (
          <>
            {!telegram.platformEnabled ? <div className="notice notice-amber">{t.room.tgDisabledPlatform}</div> : null}
            {telegram.platformEnabled && telegram.paid && !telegram.allowed ? (
              <div className="notice notice-amber">{t.room.tgNeedPremium}</div>
            ) : null}
            {!telegram.linked ? (
              <section className="glass card border-white/40 p-5 shadow-glass">
                <PanelTitle icon={Send} tone="sky" title={t.room.tgTitle} />
                <p className="mt-2 text-sm leading-relaxed text-muted">{t.room.tgIntro}</p>
                <ol className="mt-4 space-y-2.5">
                  {[t.room.tgStep1, t.room.tgStep2, t.room.tgStep3].map((step, i) => (
                    <li key={step} className="flex gap-3 text-sm text-ink-2">
                      <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-sky-soft text-xs font-extrabold text-sky-ink">
                        {formatNumber(i + 1, lang)}
                      </span>
                      <span className="leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ol>
                <Link href="/dashboard/settings#telegram" className="btn btn-primary btn-sm mt-5">
                  <Send className="size-4" />
                  {t.room.tgGoSettings}
                </Link>
              </section>
            ) : (
              <>
                <section className="glass card border-white/40 p-5 shadow-glass">
                  <div className="flex items-center gap-3">
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-sky-soft text-sky-ink">
                      <Send className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-muted">{t.room.tgConnectedAs}</p>
                      <p className="truncate font-extrabold text-ink" dir="auto">
                        {telegram.chatName}
                      </p>
                    </div>
                    <span className="badge badge-mint">{t.room.tgStatusActive}</span>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-line bg-surface-2/60 p-3">
                    <div>
                      <p className="text-sm font-bold text-ink">{telegram.muted ? t.room.tgRoomMuted : t.room.tgRoomNotifying}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-muted">{t.room.tgMuteHint}</p>
                    </div>
                    <ActionButton
                      action={roomAction}
                      fields={fields("tgMute")}
                      className="rounded-full p-0.5"
                      title={t.room.tgMuteHint}
                    >
                      <span
                        className={cn(
                          "relative block h-[1.45rem] w-10 rounded-full transition",
                          !telegram.muted ? "bg-gradient-to-r from-accent to-accent-2" : "bg-line-strong",
                        )}
                      >
                        <span
                          className={cn(
                            "absolute top-[3px] size-[calc(1.45rem-6px)] rounded-full bg-white shadow transition-all",
                            !telegram.muted ? "start-[calc(100%-1.45rem+3px)]" : "start-[3px]",
                          )}
                        />
                      </span>
                    </ActionButton>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <ActionButton action={roomAction} fields={fields("tgTest")} className="btn btn-secondary btn-sm">
                      <Zap className="size-4" />
                      {t.room.tgTest}
                    </ActionButton>
                    <Link href="/dashboard/settings#telegram" className="btn btn-ghost btn-sm">
                      <ExternalLink className="size-4" />
                      {t.room.tgManageAccount}
                    </Link>
                  </div>
                </section>

                <section className="card p-5">
                  <PanelTitle icon={Terminal} tone="mint" title={t.room.tgCommands} />
                  <ul className="mt-4 space-y-1.5" dir="ltr">
                    {commands.map((c) => (
                      <li key={c.command} className="flex items-baseline gap-2 text-xs">
                        <code className="shrink-0 rounded-md bg-accent-soft px-1.5 py-0.5 font-mono font-bold text-accent-ink">/{c.command}</code>
                        <span className="text-muted">{c.description}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              </>
            )}
          </>
        ) : null}

        {tab === "members" ? (
          <section className="card p-5">
            <PanelTitle icon={Users} tone="mint" title={t.room.membersTitle} aside={<span className="badge badge-neutral">{formatNumber(activeMembers, lang)}</span>} />
            {members.length === 0 ? (
              <p className="mt-4 text-sm leading-relaxed text-muted">{t.room.membersEmpty}</p>
            ) : (
              <ul className="mt-3 divide-y divide-line">
                {members.map((m) => {
                  const online = now > 0 && m.status === "active" && now - new Date(m.lastSeenAt).getTime() < 45_000;
                  const [seenBefore, seenAfter = ""] = t.room.lastSeen.split("{time}");
                  return (
                    <li key={m.id} className="flex items-center gap-3 py-3">
                      <div className="relative">
                        <Avatar name={m.nickname} size={36} />
                        {online ? <span className="absolute -bottom-0.5 -end-0.5 size-3 rounded-full border-2 border-surface bg-[#4cc79a]" /> : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-ink" dir="auto">
                          {m.nickname}
                        </p>
                        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
                          {m.status === "banned" ? (
                            <span className="font-semibold text-rose-ink">{t.room.removed}</span>
                          ) : online ? (
                            <span className="font-semibold text-mint-ink">{t.room.onlineNow}</span>
                          ) : (
                            <span>
                              {seenBefore}
                              <LocalTime iso={m.lastSeenAt} mode="relative" />
                              {seenAfter}
                            </span>
                          )}
                          <span aria-hidden="true">·</span>
                          <code className="font-mono" dir="ltr">
                            #{m.shortId}
                          </code>
                        </p>
                      </div>
                      {m.status === "banned" ? (
                        <ActionButton action={roomAction} fields={fields("unban", { memberId: m.id })} className="btn btn-secondary btn-sm">
                          <UserCheck className="size-4" />
                          {t.room.unban}
                        </ActionButton>
                      ) : (
                        <ActionButton action={roomAction} fields={fields("kick", { memberId: m.id })} confirm={t.room.kickConfirm} className="btn btn-danger btn-sm">
                          <UserX className="size-4" />
                          {t.room.kick}
                        </ActionButton>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ) : null}

        {tab === "settings" ? (
          <>
            <section className="card p-5">
              <PanelTitle icon={PencilLine} title={t.room.settingsTitle} />
              <ActionForm action={roomAction} className="mt-4 space-y-4">
                <Hidden roomId={room.id} op="update" />
                <div>
                  <label className="label" htmlFor="room-name-edit">
                    {t.dash.roomName}
                  </label>
                  <input id="room-name-edit" name="name" className="input" defaultValue={room.name} required maxLength={60} dir="auto" />
                </div>
                <div>
                  <label className="label" htmlFor="room-desc-edit">
                    {t.dash.description}
                  </label>
                  <textarea id="room-desc-edit" name="description" className="input" rows={3} maxLength={280} defaultValue={room.description} dir="auto" />
                </div>
                <SubmitButton className="btn btn-primary btn-sm">{t.common.save}</SubmitButton>
              </ActionForm>
            </section>
            <section className="card border-rose/70 p-5">
              <PanelTitle icon={TriangleAlert} tone="rose" title={t.room.dangerTitle} />
              <div className="mt-4 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-ink">{t.room.clear}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted">{t.room.clearText}</p>
                  </div>
                  <ActionButton action={roomAction} fields={fields("clear")} confirm={t.room.clearConfirm} className="btn btn-danger btn-sm">
                    {t.room.clear}
                  </ActionButton>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
                  <div>
                    <p className="text-sm font-bold text-ink">{t.room.deleteRoom}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted">{t.room.deleteText}</p>
                  </div>
                  <ActionButton action={roomAction} fields={fields("delete")} confirm={t.room.deleteConfirm} className="btn btn-danger btn-sm">
                    {t.common.delete}
                  </ActionButton>
                </div>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
