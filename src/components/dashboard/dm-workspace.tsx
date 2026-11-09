"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, EyeOff, Trash2 } from "lucide-react";
import { deleteChatAction } from "@/app/actions/rooms";
import { ChatView } from "@/components/chat/chat-view";
import { useI18n } from "@/components/i18n-provider";
import { ActionForm, Modal, SubmitButton } from "@/components/ui";
import type { ChatSnapshot } from "@/lib/chat";
import { hideRoom } from "@/lib/vault";

type Props = {
  roomId: string;
  peer: { displayName: string; username: string | null };
  snapshot: ChatSnapshot;
  maxLength: number;
};

/**
 * 1:1 private chat pane — a focused Telegram-like conversation view.
 * Management tabs, invite links, passwords and bots do not exist here;
 * the only actions are hide (device vault) and delete (for both sides).
 */
export function DmWorkspace({ roomId, peer, snapshot, maxLength }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const [confirmDelete, setConfirmDelete] = useState(false);

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
