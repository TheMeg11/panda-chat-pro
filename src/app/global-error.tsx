"use client";

/**
 * Root error boundary (last resort — when the route boundary itself fails).
 * Owns the full document, so it renders its own <html>/<body>.
 * Stale-chunk errors (post-redeploy long-lived clients) auto-reload once.
 */
import { useEffect } from "react";
import { isStaleChunkError, recoverOnce } from "./error";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (isStaleChunkError(error) && recoverOnce()) return;
  }, [error]);

  return (
    <html lang="fa" dir="rtl">
      <body style={{ margin: 0, background: "#12141c", color: "#f2f4fa" }}>
        <main
          style={{
            minHeight: "100dvh",
            display: "grid",
            placeItems: "center",
            padding: "24px",
            textAlign: "center",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <div>
            <p style={{ fontSize: 13, letterSpacing: "0.2em", fontWeight: 800, opacity: 0.7 }}>
              PANDA CHAT
            </p>
            <h1 style={{ fontSize: 22, fontWeight: 800, marginTop: 8 }}>مشکلی پیش آمد</h1>
            <p style={{ fontSize: 14, opacity: 0.75, marginTop: 12, maxWidth: 340 }}>
              یک خطای غیرمنتظره رخ داد. با دکمه‌ی زیر دوباره تلاش کنید.
            </p>
            <button
              type="button"
              onClick={reset}
              style={{
                marginTop: 24,
                padding: "12px 24px",
                borderRadius: 14,
                border: "none",
                fontWeight: 800,
                fontSize: 14,
                cursor: "pointer",
                background: "#e8574c",
                color: "#fff",
              }}
            >
              تلاش مجدد
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
