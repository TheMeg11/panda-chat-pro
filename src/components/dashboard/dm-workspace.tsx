"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, EyeOff, LockKeyhole, ShieldCheck, Timer, Trash2 } from "lucide-react";
import { deleteChatAction } from "@/app/actions/rooms";
import { publishE2eeKeyAction, setRoomE2eeAction, setRoomTtlAction } from "@/app/actions/e2ee";
import { ChatView } from "@/components/chat/chat-view";
import { useI18n } from "@/components/i18n-provider";
import { ActionForm, Modal, SubmitButton } from "@/components/ui";
import type { ChatSnapshot } from "@/lib/chat";
import { errorText } from "@/lib/i18n";
import { hideRoom } from "@/lib/vault";
import { generateIdentity } from "@/lib/e2ee-client";
import type { ActionState } from "@/lib/utils";

type Props = {
  roomId: string;
  peer: { displayName: string; username: string };
  snapshot: ChatSnapshot;
  maxLength: number;
  /** E2EE key availability for me and the peer (server-checked). */
  e2ee: { enabled: boolean; meHasKey: boolean; peerHasKey: boolean; featureEnabled: boolean };
};

/**
 * 1:1 private chat pane — a focused Telegram-like conversation view.
 * Management tabs, invite links, passwords and bots do not exist here;
 * actions are hide (device vault), E2EE & self-destruct settings, delete.
 */
export function DmWorkspace({ roomId, peer, snapshot, maxLength, e2ee }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);
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
        headerStart={
          <Link href="/dashboard" className="btn btn-ghost btn-icon btn-sm -ms-1" aria-label={t.dm.backToChats} title={t.dm.backToChats}>
            <ChevronLeft className="size-4 rtl:rotate-180" />
          </Link>
        }
        headerActions={
          <>
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm"
              title={t.dm.chatSettings}
              aria-label={t.dm.chatSettings}
              data-tutorial="vault"
              onClick={() => setSettingsOpen(true)}
            >
              <ShieldCheck className="size-4" />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm"
              title={t.dm.hideChat}
              aria-label={t.dm.hideChat}
              onClick={() => {
                hideRoom(roomId);
                router.push("/dashboard");
              }}
            >
              <EyeOff className="size-4" />
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-icon btn-sm"
              title={t.dm.deleteChat}
              aria-label={t.dm.deleteChat}
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-4" />
            </button>
          </>
        }
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

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title={t.dm.deleteChat} subtitle={t.dm.deleteChatSubtitle}>
        <ActionForm action={deleteChatAction} className="space-y-4">
          <input type="hidden" name="roomId" value={roomId} />
          <p className="text-sm leading-relaxed text-muted">{t.dm.deleteChatConfirm}</p>
          <div className="flex gap-2">
            <button type="button" className="btn btn-secondary flex-1" onClick={() => setConfirmDelete(false)}>
              {t.common.cancel}
            </button>
            <SubmitButton className="btn btn-danger flex-1">{t.dm.deleteChat}</SubmitButton>
          </div>
        </ActionForm>
      </Modal>
    </>
  );
}
