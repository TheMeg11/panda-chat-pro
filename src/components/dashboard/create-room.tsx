"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { createRoomAction } from "@/app/actions/rooms";
import { useI18n } from "@/components/i18n-provider";
import { ActionForm, Modal, PasswordInput, SubmitButton } from "@/components/ui";
import { hiddenRoomIds } from "@/lib/vault";
import { cn, fmt } from "@/lib/utils";

type Props = {
  disabled?: boolean;
  className?: string;
  /** icon-only floating action button (Telegram-style) */
  fab?: boolean;
  /** platform room limit — the modal shows how many VISIBLE rooms are used, never hidden ones */
  roomLimit?: number;
  totalRooms?: number;
};

export function CreateRoomButton({ disabled = false, className, fab = false, roomLimit, totalRooms }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [used, setUsed] = useState<number | null>(null);

  const openModal = () => {
    if (typeof totalRooms === "number") {
      // Hidden (vault) rooms are subtracted so the hint never reveals them.
      const hidden = hiddenRoomIds().filter((id) => /^[0-9a-f-]{36}$/.test(id)).length;
      setUsed(Math.max(0, totalRooms - hidden));
    } else {
      setUsed(null);
    }
    setOpen(true);
  };

  return (
    <>
      {fab ? (
        <button
          type="button"
          className={cn("btn btn-primary", className)}
          onClick={openModal}
          disabled={disabled}
          aria-label={t.dash.newRoom}
          title={t.dash.newRoom}
        >
          <Plus className="size-6" />
        </button>
      ) : (
        <button type="button" className={cn("btn btn-primary", className)} onClick={openModal} disabled={disabled}>
          <Plus className="size-4" />
          {t.dash.newRoom}
        </button>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={t.dash.createTitle} subtitle={t.dash.createSubtitle}>
        <ActionForm action={createRoomAction} className="space-y-4">
          {used !== null && typeof roomLimit === "number" ? (
            <p className="hint">{fmt(t.dash.roomsUsed, { used, max: roomLimit })}</p>
          ) : null}
          <div>
            <label className="label" htmlFor="room-name">
              {t.dash.roomName}
            </label>
            <input id="room-name" name="name" className="input" required maxLength={60} autoFocus placeholder={t.dash.roomNamePlaceholder} dir="auto" />
          </div>
          <div>
            <label className="label" htmlFor="room-description">
              {t.dash.description} <span className="font-semibold text-faint">({t.common.optional})</span>
            </label>
            <textarea id="room-description" name="description" className="input" rows={2} maxLength={280} placeholder={t.dash.descriptionPlaceholder} dir="auto" />
          </div>
          <div>
            <label className="label" htmlFor="room-pass">
              {t.dash.password} <span className="font-semibold text-faint">({t.common.optional})</span>
            </label>
            <PasswordInput id="room-pass" name="password" required={false} autoComplete="new-password" minLength={4} placeholder={t.dash.passwordPlaceholder} />
            <p className="hint">{t.dash.passwordHint}</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </button>
            <SubmitButton>{t.dash.create}</SubmitButton>
          </div>
        </ActionForm>
      </Modal>
    </>
  );
}
