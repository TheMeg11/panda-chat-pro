"use client";

/**
 * Route error boundary (every segment under /app).
 *
 * v1.5.3: the #1 recurring production complaint was the raw error screen a
 * LONG-LIVED client (open tab / installed PWA) hits after a redeploy — its
 * in-memory chunk set no longer exists on the server, so the first client-side
 * navigation fails to import a lazy chunk ("Failed to fetch dynamically
 * imported module") and every page looks broken. The boundary detects that
 * signature and performs a single full reload, which re-fetches the current
 * HTML + chunk manifest and heals the session.
 */
import { useEffect, useState } from "react";
import { PandaMark } from "@/components/brand";

const STALE_CHUNK_RE =
  /Failed to fetch dynamically imported module|error loading dynamically imported module|Loading chunk \d+|ChunkLoadError|Importing a module script failed|dynamically imported module/i;

export function isStaleChunkError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack ?? "" : "";
  return STALE_CHUNK_RE.test(msg) || STALE_CHUNK_RE.test(stack);
}

/** Reload once per 20s window — never loop on a persistent error. */
export function recoverOnce(): boolean {
  try {
    const key = "pc-chunk-recovery";
    const last = Number(sessionStorage.getItem(key) ?? 0);
    if (Date.now() - last < 20_000) return false;
    sessionStorage.setItem(key, String(Date.now()));
  } catch {
    /* private mode — still allow one reload */
  }
  window.location.reload();
  return true;
}

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (isStaleChunkError(error) && recoverOnce()) return;
  }, [error]);

  const [tried, setTried] = useState(false);
  if (isStaleChunkError(error)) {
    return (
      <main className="relative grid min-h-dvh place-items-center overflow-hidden px-6">
        <div className="hero-glow pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="relative text-center fade-up">
          <PandaMark size={72} className="mx-auto mb-6 float-slow" />
          <h1 className="text-2xl font-extrabold text-ink">به‌روزرسانی…</h1>
          <p className="mx-auto mt-3 max-w-sm text-sm text-muted">
            نسخه‌ی تازه‌ای از پاندا چت منتشر شده است. صفحه رفرش می‌شود…
          </p>
          <button
            type="button"
            onClick={() => {
              setTried(true);
              window.location.reload();
            }}
            className="btn btn-primary btn-lg mt-8"
          >
            {tried ? "در حال رفرش…" : "رفرش دستی"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-6">
      <div className="hero-glow pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative text-center fade-up">
        <PandaMark size={72} className="mx-auto mb-6 float-slow" />
        <p className="text-sm font-extrabold tracking-[0.2em] text-accent-ink">خطا</p>
        <h1 className="mt-2 text-2xl font-extrabold text-ink">مشکلی پیش آمد</h1>
        <p className="mx-auto mt-3 max-w-sm text-sm text-muted">
          دوباره تلاش کنید؛ اگر درست نشد لحظه‌ای بعد برگردید.
        </p>
        <div className="mt-8 flex items-center justify-center gap-2">
          <button type="button" onClick={reset} className="btn btn-primary btn-lg">
            تلاش مجدد
          </button>
          <a href="/dashboard" className="btn btn-secondary btn-lg">
            چت‌ها
          </a>
        </div>
      </div>
    </main>
  );
}
