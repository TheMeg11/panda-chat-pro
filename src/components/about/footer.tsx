"use client";

import { useVersionTap, VaultDialog, type RoomBrief } from "@/components/security/vault-dialog";
import { PandaMark } from "@/components/brand";
import { APP_NAME, APP_VERSION } from "@/lib/version";

/**
 * The About page footer — the ZIP Footer layout, with the version line turned
 * into the secret 5-tap vault entrance (same gesture as the settings page) and
 * the #version anchor target for the hidden link inside the private-chats card.
 */
export function AboutFooter({ rooms }: { rooms: RoomBrief[] }) {
  const { onTap, open, setOpen } = useVersionTap();

  return (
    <>
      <footer className="border-t border-line bg-surface/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-6 text-xs text-faint sm:flex-row">
          <span id="version" dir="ltr" className="inline-flex scroll-mt-24 items-center gap-2 font-extrabold text-muted">
            <PandaMark size={22} />
            <button
              type="button"
              onClick={onTap}
              className="cursor-default select-none"
              style={{ all: "unset" }}
              aria-label={`${APP_NAME} ${APP_VERSION}`}
            >
              {APP_NAME} V{APP_VERSION}
            </button>
          </span>
          <p className="text-center">تیم کانار · سال ساخت ۱۴۰۵ · تمامی حقوق محفوظ است.</p>
        </div>
      </footer>
      <VaultDialog open={open} onOpenChange={setOpen} rooms={rooms} />
    </>
  );
}
