"use client";

import { VersionTap } from "@/components/privacy";
import { useI18n } from "@/components/i18n-provider";

/**
 * v2.2.0 — the About page footer, restyled for the theme. The version line at
 * the very bottom is the ONLY entrance to the hidden-chats vault: five quick
 * taps on it (you have to scroll all the way down to reach it). The #version
 * anchor stays for the hidden link inside the private-chats card. The vault is
 * server-backed now; VersionTap owns the counter and the dialog.
 */
export function AboutFooter() {
  const { lang } = useI18n();
  return (
    <footer className="mt-16 border-t border-line bg-surface/60">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-8 text-xs text-faint sm:flex-row">
        <VersionTap />
        <p className="text-center">
          {lang === "fa" ? "تیم کانار · سال ساخت ۱۴۰۵ · تمامی حقوق محفوظ است." : "Kanar team · Built 2026 · All rights reserved."}
        </p>
      </div>
    </footer>
  );
}
