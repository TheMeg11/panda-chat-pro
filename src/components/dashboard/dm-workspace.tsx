"use client";

import { useActionState, useState } from "react";
import { LockKeyhole, Timer } from "lucide-react";
import { publishE2eeKeyAction, setRoomE2eeAction, setRoomTtlAction } from "@/app/actions/e2ee";
import { ChatView } from "@/components/chat/chat-view";
import { DmProfilePanel } from "@/components/chat/chat-menu";
import { useI18n } from "@/components/i18n-provider";
import { ActionForm, Modal, SubmitButton } from "@/components/ui";
import type { ChatSnapshot } from "@/lib/chat";
import { errorText } from "@/lib/i18n";
import { generateIdentity } from "@/lib/e2ee-client";
import type { ActionState } from "@/lib/utils";

type Props = {
  roomId: string;
  /** v1.7.0 — the profile panel carries the Telegram-style identity lines */
  peer: {
    displayName: string;
    username: string;
    bio?: string | null;
    /** ISO timestamp of the peer's last activity (their DM member row) */
    lastSeenAt: string | null;
    /** server-served avatar URL (empty → initials fallback) */
    avatarSrc?: string;
  };
  /** v1.7.0 — current block state between the two accounts (either direction) */
  blocked: boolean;
  snapshot: ChatSnapshot;
  maxLength: number;
  /** E2EE key availability for me and the peer (server-checked). */
  e2ee: { enabled: boolean; meHasKey: boolean; peerHasKey: boolean; featureEnabled: boolean };
};

/**
 * 1:1 private chat pane — a focused Telegram-like conversation view.
 * The header has NO hold gesture and NO per-action buttons anymore: tapping
 * the title/avatar opens the profile panel (DmProfilePanel), whose ☰ menu
 * carries every chat action (block, clear history, delete, hide) plus the
 * account links. The privacy sheet (E2EE + self-destruct) stays a modal.
 */
export function DmWorkspace({ roomId, peer, blocked, snapshot, maxLength, e2ee }: Props) {
  const { t } = useI18n();
  const [profileOpen, setProfileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [publishState, publishAction, publishPending] = useActionState<ActionState, FormData>(publishE2eeKeyAction, {});
  const [busy, setBusy] = useState(false);

  // The server already applies peer overrides (SSR + polling API). This only guards
  // against a stale `initial` snapshot, e.g. after a bfcache restore.
  const dmSnapshot: ChatSnapshot = {
    ...snapshot,
    room: {
      ...snapshot.room,
      name: peer.displayName,
      description: "",
      subtitle: peer.username ? `@${peer.username}` : undefined,
      direct: true,
    },
  };

  /** Publishes this browser's E2EE identity, wrapped with the account password. */
  const publishKey = async (password: string) => {
    const identity = await generateIdentity(password);
    const fd = new FormData();
    fd.set("publicKeyJwk", JSON.stringify(identity.publicKeyJwk));
    fd.set("wrappedPrivateKey", identity.wrappedPrivateKey);
    fd.set("kdfSalt", identity.kdfSalt);
    fd.set("kdfIterations", String(identity.kdfIterations));
    publishAction(fd);
  };

  return (
    <>
      <ChatView
        endpoint={`/api/rooms/${roomId}/messages`}
        initial={dmSnapshot}
        maxLength={maxLength}
        onHeaderOpen={() => setProfileOpen(true)}
      />

      {/* Telegram-style profile panel — identity, last seen, ☰ chat actions */}
      <DmProfilePanel
        roomId={roomId}
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        peer={{ displayName: peer.displayName, username: peer.username || null, bio: peer.bio ?? null, lastSeenAt: peer.lastSeenAt }}
        avatarSrc={peer.avatarSrc}
        blocked={blocked}
        onOpenPrivacy={() => setSettingsOpen(true)}
        e2eeEnabled={e2ee.enabled}
      />

      {/* Conversation privacy settings: E2EE + self-destruct */}
      <Modal open={settingsOpen} onClose={() => setSettingsOpen(false)} title={t.dm.chatSettings}>
        <div className="space-y-5">
          {e2ee.featureEnabled ? (
            <section className="rounded-2xl border border-line bg-surface-2/50 p-4">
              <p className="flex items-center gap-2 text-sm font-extrabold text-ink">
                <LockKeyhole className="size-4 text-accent-ink" />
                {t.e2ee.title}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-muted">{t.e2ee.subtitle}</p>

              {e2ee.enabled ? (
                <>
                  <p className="notice notice-mint mt-3">{t.e2ee.enabled}</p>
                  <ActionForm action={setRoomE2eeAction} showMessage={false} className="mt-3">
                    <input type="hidden" name="roomId" value={roomId} />
                    <input type="hidden" name="enable" value="false" />
                    <SubmitButton className="btn btn-soft btn-sm">{t.e2ee.disable}</SubmitButton>
                  </ActionForm>
                </>
              ) : (
                <>
                  <p className="mt-2 text-xs text-muted">{t.e2ee.enableHint}</p>
                  {!e2ee.meHasKey ? (
                    <form
                      className="mt-3 space-y-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const fd = new FormData(e.currentTarget);
                        const password = String(fd.get("password") ?? "");
                        setBusy(true);
                        void publishKey(password).finally(() => setBusy(false));
                      }}
                    >
                      <label className="label" htmlFor="e2ee-password">
                        {t.e2ee.publishHint}
                      </label>
                      <input id="e2ee-password" name="password" type="password" className="input" required minLength={8} autoComplete="current-password" dir="ltr" />
                      {publishState.error ? <p className="notice notice-rose">{errorText(t, publishState.error)}</p> : null}
                      {publishState.ok ? <p className="notice notice-mint">{t.e2ee.keyPublished}</p> : null}
                      <button type="submit" className="btn btn-primary btn-sm w-full" disabled={publishPending || busy}>
                        {publishPending || busy ? <span className="spinner" aria-hidden="true" /> : <LockKeyhole className="size-4" />}
                        {t.e2ee.publish}
                      </button>
                    </form>
                  ) : !e2ee.peerHasKey ? (
                    <p className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2.5 text-xs font-semibold text-muted">
                      <span className="spinner" aria-hidden="true" />
                      {t.e2ee.waiting}
                    </p>
                  ) : (
                    <ActionForm action={setRoomE2eeAction} showMessage={false} className="mt-3">
                      <input type="hidden" name="roomId" value={roomId} />
                      <input type="hidden" name="enable" value="true" />
                      <SubmitButton className="btn btn-primary btn-sm w-full">
                        <LockKeyhole className="size-4" />
                        {t.e2ee.enable}
                      </SubmitButton>
                    </ActionForm>
                  )}
                </>
              )}
            </section>
          ) : null}

          <section className="rounded-2xl border border-line bg-surface-2/50 p-4">
            <p className="flex items-center gap-2 text-sm font-extrabold text-ink">
              <Timer className="size-4 text-accent-ink" />
              {t.selfdestruct.title}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted">{t.selfdestruct.subtitle}</p>
            <ActionForm action={setRoomTtlAction} showMessage={false} className="mt-3 flex items-center gap-2">
              <input type="hidden" name="roomId" value={roomId} />
              <select
                name="ttl"
                defaultValue={snapshot.room.defaultTtl === 3600 ? "3600" : snapshot.room.defaultTtl === 86400 ? "86400" : snapshot.room.defaultTtl === 604800 ? "604800" : "off"}
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
        </div>
      </Modal>
    </>
  );
}
