"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Ban,
  ChevronLeft,
  KeyRound,
  Link2,
  Lock,
  LockOpen,
  MessageCircle,
  PencilLine,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Timer,
  TriangleAlert,
  UserCheck,
  Users,
  UserX,
} from "lucide-react";
import { roomAction } from "@/app/actions/rooms";
import { setRoomTtlAction } from "@/app/actions/e2ee";
import { Avatar } from "@/components/brand";
import { ChatView } from "@/components/chat/chat-view";
import { JoinedRoomInfoPanel } from "@/components/chat/chat-menu";
import { useI18n } from "@/components/i18n-provider";
import { ActionButton, ActionForm, CopyButton, LocalTime, Modal, PasswordInput, SubmitButton, useNow } from "@/components/ui";
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
  /** default self-destruct TTL in seconds (null = off) */
  defaultTtl: number | null;
};
export type WorkspaceMember = { id: string; shortId: string; nickname: string; status: string; lastSeenAt: string };
/** v2.5.0 (B-12): the owner row shown above the guest list in the members tab. */
export type WorkspaceOwner = { nickname: string } | null;

type Tab = "share" | "security" | "members" | "settings";

type Props = {
  room: WorkspaceRoom;
  /** false for rooms the viewer JOINED (not owned) — the manage drawer is owner-only */
  isOwner: boolean;
  snapshot: ChatSnapshot;
  members: WorkspaceMember[];
  owner?: WorkspaceOwner;
  maxLength: number;
};

/**
 * v2.0 — the owner's room manager is a TABBED MODAL in the theme's style
 * (pill tabs across the top), opened from the header "manage" button.
 * Mobile keeps the same modal as a bottom sheet. Everything inside is the
 * exact same forms/actions as v1.x (share / security / members / settings),
 * restyled with the v2.0 tokens.
 */
export function RoomWorkspace(props: Props) {
  const { room, snapshot, maxLength, isOwner } = props;
  const { t } = useI18n();
  const [infoOpen, setInfoOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-line bg-surface px-3 py-2 md:hidden">
        <Link href="/dashboard" className="btn btn-ghost btn-icon btn-sm" aria-label={t.room.allRooms}>
          <ChevronLeft className="size-4 rtl:rotate-180" />
        </Link>
        {isOwner ? (
          <button type="button" className="btn btn-soft btn-sm flex-1" onClick={() => setManageOpen(true)}>
            <Settings2 className="size-4" />
            {t.room.manageTab}
          </button>
        ) : (
          <p className="flex-1 truncate text-sm font-extrabold text-ink" dir="auto">
            {room.name}
          </p>
        )}
      </div>
      <div className="flex min-h-0 flex-1">
        <section className="flex min-w-0 flex-1 flex-col">
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
              onHeaderOpen={() => setInfoOpen(true)}
              headerActions={
                isOwner ? (
                  <button type="button" className="btn btn-soft btn-sm hidden md:inline-flex" onClick={() => setManageOpen(true)}>
                    <Settings2 className="size-4" />
                    {t.room.manageTab}
                  </button>
                ) : null
              }
              headerStart={
                <Link href="/dashboard" className="btn btn-ghost btn-icon btn-sm -ms-1 hidden md:inline-flex" aria-label={t.room.allRooms} title={t.room.allRooms}>
                  <ChevronLeft className="size-4 rtl:rotate-180" />
                </Link>
              }
            />
          )}
        </section>
        <JoinedRoomInfoPanel
          roomId={room.id}
          open={infoOpen}
          onClose={() => setInfoOpen(false)}
          name={room.name}
          description={room.description}
          memberCount={snapshot.room.memberCount}
        />
        {isOwner ? <RoomManagerModal open={manageOpen} onClose={() => setManageOpen(false)} {...props} /> : null}
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

/** The tabbed manage modal (theme style). */
function RoomManagerModal({ open, onClose, room, members, owner }: Props & { open: boolean; onClose: () => void }) {
  const { t, lang } = useI18n();
  const router = useRouter();
  const now = useNow();
  const [tab, setTab] = useState<Tab>("share");

  useEffect(() => {
    if (!open || tab !== "members") return;
    router.refresh();
    const id = setInterval(() => router.refresh(), 20_000);
    return () => clearInterval(id);
  }, [open, tab, router]);

  const tabs: Array<[Tab, LucideIcon, string]> = [
    ["share", Link2, t.room.tabShare],
    ["security", ShieldCheck, t.room.tabSecurity],
    ["members", Users, t.room.tabMembers],
    ["settings", Settings2, t.room.tabSettings],
  ];
  const fields = (op: string, extra: Record<string, string> = {}) => ({ roomId: room.id, op, ...extra });
  const activeMembers = members.filter((m) => m.status === "active").length;

  return (
    <Modal open={open} onClose={onClose} title={t.room.manageTab} subtitle={room.name}>
      {/* pill tab bar (theme's Segmented) — resets via key on every open */}
      <div className="no-scrollbar -mx-1 mb-5 flex gap-1 overflow-x-auto px-1 pb-1" role="tablist">
        {tabs.map(([key, Icon, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold transition",
              tab === key ? "bg-accent text-white shadow-[0_8px_18px_-8px_rgba(91,59,255,0.6)]" : "bg-surface-3 text-muted hover:text-ink",
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="min-h-0 space-y-4">
        {tab === "share" ? (
          <section className="rounded-2xl border border-line bg-surface-2/50 p-5">
            <PanelTitle icon={Link2} title={t.room.inviteTitle} />
            <p className="mt-2 text-sm leading-relaxed text-muted">{t.room.inviteText}</p>
            {/* v2.5.0 (B-19): horizontal-scroll instead of multi-line wrap so the
                long token can never grow tall enough to cover the close button. */}
            <div className="mt-4 overflow-x-auto rounded-xl border border-line bg-surface p-3 font-mono text-xs leading-relaxed text-ink-2" dir="ltr">
              <span className="block whitespace-nowrap">{room.inviteUrl}</span>
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
            <section className="rounded-2xl border border-line bg-surface-2/50 p-5">
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
            <section className="rounded-2xl border border-line bg-surface-2/50 p-5">
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

        {tab === "members" ? (
          <section className="rounded-2xl border border-line bg-surface-2/50 p-5" data-tutorial="online-status">
            <PanelTitle icon={Users} tone="mint" title={t.room.membersTitle} aside={<span className="badge badge-neutral">{formatNumber(activeMembers + (owner ? 1 : 0), lang)}</span>} />
            {owner ? (
              <ul className="mt-3 divide-y divide-line">
                <li className="flex items-center gap-3 py-3">
                  <Avatar name={owner.nickname} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink" dir="auto">
                      {owner.nickname}
                    </p>
                    <p className="text-xs font-semibold text-accent-ink">{t.common.owner}</p>
                  </div>
                </li>
              </ul>
            ) : null}
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
            <section className="rounded-2xl border border-line bg-surface-2/50 p-5">
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
            <section className="rounded-2xl border border-line bg-surface-2/50 p-5" data-tutorial="rooms">
              <PanelTitle icon={Timer} title={t.selfdestruct.title} />
              <p className="mt-1 text-xs leading-relaxed text-muted">{t.selfdestruct.subtitle}</p>
              <ActionForm action={setRoomTtlAction} showMessage={false} className="mt-4 flex items-center gap-2">
                <input type="hidden" name="roomId" value={room.id} />
                <select
                  name="ttl"
                  defaultValue={room.defaultTtl === 3600 ? "3600" : room.defaultTtl === 86400 ? "86400" : room.defaultTtl === 604800 ? "604800" : "off"}
                  className="input h-10 flex-1"
                  aria-label={t.selfdestruct.title}
                >
                  <option value="off">{t.selfdestruct.off}</option>
                  <option value="3600">{t.selfdestruct.oneHour}</option>
                  <option value="86400">{t.selfdestruct.oneDay}</option>
                  <option value="604800">{t.selfdestruct.oneWeek}</option>
                </select>
                <SubmitButton className="btn btn-primary btn-sm h-10">{t.common.save}</SubmitButton>
              </ActionForm>
            </section>
            <section className="rounded-2xl border border-rose/70 bg-rose-soft/30 p-5">
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
    </Modal>
  );
}
