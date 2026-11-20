"use client";

/**
 * v2.2.0 — thin re-export surface for the hidden-chats vault.
 *
 * The old device-local implementation (5-second hold-to-hide, the browser
 * vault, boot scripts hiding room cards before paint) is gone: hiding is
 * now an instant server action from the chat menu, and the vault — PIN setup,
 * unlock, the hidden list, PIN change — lives in
 * `@/components/security/vault-dialog`, backed by the account (hidden_rooms +
 * users.hidden_pin_hash). The secret entrance is unchanged: five quick taps on
 * the version number in the About page footer.
 */

import { useVersionTap, VaultDialog } from "@/components/security/vault-dialog";

export { useVersionTap, VaultDialog };

import { PandaMark } from "@/components/brand";
import { APP_NAME, APP_VERSION } from "@/lib/version";

/**
 * The About-page footer guest: the version line is the ONLY vault entrance —
 * five quick taps open the vault dialog.
 */
export function VersionTap() {
  const { onTap, open, setOpen } = useVersionTap();
  return (
    <>
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
      <VaultDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
