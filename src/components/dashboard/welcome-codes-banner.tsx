"use client";

/**
 * v2.5.0 (B-07) — the one-time post-registration recovery-codes banner.
 *
 * The register action redirects to /dashboard?welcome=1&codes=… with the ten
 * freshly minted account-recovery codes. They are displayed ONCE here (the
 * URL is stripped from history afterwards — a refresh shows nothing), because
 * from then on only their sha256 hashes exist server-side. These codes are
 * the only way back into a forgotten-password account, so the banner is
 * deliberately loud and offers a download.
 */

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Copy, Download, ShieldAlert } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

export function WelcomeCodesBanner() {
  const params = useSearchParams();
  const router = useRouter();
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const codes = params.get("codes")?.split(",").filter((c) => c.length > 3) ?? [];

  useEffect(() => {
    if (codes.length === 0) return;
    // Strip the codes from the URL — a refresh or a shared link must not leak them.
    window.history.replaceState({}, "", "/dashboard");
  }, [codes.length]);

  if (codes.length === 0) return null;

  const download = () => {
    const text =
      t.recovery.fileHeader +
      "\n\n" +
      codes.map((c, i) => `${i + 1}. ${c}`).join("\n") +
      "\n\n" +
      t.recovery.fileFooter +
      "\n";
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "panda-chat-recovery-codes.txt";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the download button still works */
    }
  };

  return (
    <div className="mx-auto max-w-2xl px-4 pt-6">
      <div className="rounded-2xl border border-mint/50 bg-mint-soft/50 p-5" role="region" aria-label={t.recovery.title}>
        <p className="flex items-center gap-2 font-extrabold text-ink">
          <ShieldAlert className="size-5 text-mint-ink" />
          {t.recovery.title}
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">{t.recovery.text}</p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {codes.map((c) => (
            <code key={c} className="rounded-lg bg-surface px-2 py-1.5 text-center font-mono text-xs text-ink" dir="ltr">
              {c}
            </code>
          ))}
        </div>
        <p className="mt-3 text-xs font-bold text-mint-ink">{t.recovery.onceWarning}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void copy()}>
            <Copy className="size-4" />
            {copied ? t.recovery.copied : t.recovery.copy}
          </button>
          <button type="button" className="btn btn-soft btn-sm" onClick={download}>
            <Download className="size-4" />
            {t.recovery.download}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => router.push("/dashboard")}>
            {t.common.close}
          </button>
        </div>
      </div>
    </div>
  );
}
