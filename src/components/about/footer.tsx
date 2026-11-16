"use client";

import { useVersionTap, VaultDialog, type RoomBrief } from "@/components/security/vault-dialog";
import { PandaMark } from "@/components/brand";
import { useI18n } from "@/components/i18n-provider";
import { APP_NAME, APP_VERSION } from "@/lib/version";

/**
 * v2.0 — the About page footer, restyled for the theme. The version line at
 * the very bottom is the ONLY entrance to the hidden-chats vault: five quick
 * taps on it (you have to scroll all the way down to reach it). The #version
 * anchor stays for the hidden link inside the private-chats card.
 */
export function AboutFooter({ rooms }: { rooms: RoomBrief[] }) {
  const { onTap, open, setOpen } = useVersionTap();
  const { lang } = useI18n();

  return (
    <>
      <footer className="mt-16 border-t border-line bg-surface/60">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-xs text-faint sm:flex-row">
          <span id="version" dir="ltr" className="inline-flex scroll-mt-24 items-center gap-2 font-extrabold text-muted">
            <PandaMark size={22} />
            <button
              type="button"
              onClick={onTap}
              className="cursor-default select-none rounded-full px-1 transition hover:text-ink"
              aria-label={`${APP_NAME} ${APP_VERSION}`}
            >
              {APP_NAME} V{APP_VERSION}
            </button>
          </span>
          <p className="text-center">
            {lang === "fa" ? "تیم کانار · سال ساخت ۱۴۰۵ · تمامی حقوق محفوظ است." : "Kanar team · Built 2026 · All rights reserved."}
          </p>
        </div>
      </footer>
      <VaultDialog open={open} onOpenChange={setOpen} rooms={rooms} />
    </>
  );
}
