"use client";

/**
 * v2.4.2 — recovery guide for getUserMedia NotAllowedError.
 *
 * The raw "permission denied" message was a dead end: NotAllowedError also
 * fires when the page runs inside an in-app browser (Telegram/Instagram
 * WebViews ship without the RECORD_AUDIO permission), when the OS-level mic
 * toggle is off (iOS Settings → Safari → Microphone), or after the user
 * dismissed Chrome's prompt once (it then auto-denies silently — there is no
 * re-prompt API). This guide detects which situation the user is in and shows
 * the exact recovery steps for THEIR browser plus a retry.
 */

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

/** Identify in-app browsers / WebViews whose WebViews usually lack mic access. */
function detectInApp(ua: string): string | null {
  if (/Telegram/i.test(ua)) return "Telegram";
  if (/Instagram/i.test(ua)) return "Instagram";
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return "Facebook";
  if (/WhatsApp/i.test(ua)) return "WhatsApp";
  if (/Line\//i.test(ua)) return "LINE";
  if (/Snapchat/i.test(ua)) return "Snapchat";
  if (/Discord/i.test(ua)) return "Discord";
  if (/; wv\)/i.test(ua)) return "WebView";
  return null;
}

function isIos(ua: string): boolean {
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function MicDeniedGuide({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const inApp = detectInApp(ua);
  const ios = isIos(ua);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      setCopied(true);
    } catch {
      // Clipboard API is often blocked in in-app browsers — fall back.
      try {
        const ta = document.createElement("textarea");
        ta.value = location.href;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        setCopied(true);
        ta.remove();
      } catch {
        /* nothing else we can do */
      }
    }
    setTimeout(() => setCopied(false), 2200);
  };

  return (
    <div className="w-full rounded-xl border border-rose-ink/30 bg-rose-ink/5 px-3 py-2 text-[12px] leading-5" role="alert">
      <p className="font-bold text-rose-ink">{t.chat.micDeniedTitle}</p>
      {inApp ? (
        <p className="mt-1 text-muted">
          {t.chat.micDeniedInApp.replace("{app}", inApp)}{" "}
          <button
            type="button"
            onClick={() => void copy()}
            className="btn btn-soft btn-sm ms-1 inline-flex h-6 items-center gap-1 px-2 text-[11px] font-semibold align-middle"
          >
            {copied ? <Check className="size-3" aria-hidden="true" /> : <Copy className="size-3" aria-hidden="true" />}
            {copied ? t.chat.micDeniedCopied : t.chat.micDeniedCopy}
          </button>
        </p>
      ) : null}
      <ol className="mt-1.5 list-decimal space-y-0.5 ps-4 text-muted">
        <li>{ios ? t.chat.micDeniedIos : t.chat.micDeniedAndroid}</li>
        {!ios ? <li>{t.chat.micDeniedDesktop}</li> : null}
        <li>{t.chat.micDeniedReload}</li>
      </ol>
      <button type="button" onClick={onRetry} className="btn btn-soft btn-sm mt-2 h-7 px-3 text-[11px] font-semibold">
        {t.chat.micDeniedRetry}
      </button>
    </div>
  );
}
