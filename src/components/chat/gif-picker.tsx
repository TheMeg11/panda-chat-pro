"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlay } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

type Props = { onPick: (gifId: string) => void; disabled?: boolean };
type GifThumb = { id: string; title: string };
/** /api/gifs/search payload: results, or a typed degradation reason. */
type SearchResponse = { gifs?: GifThumb[]; error?: "unconfigured" | "invalid-key" | "network" };

const DEBOUNCE_MS = 400;

/**
 * Composer GIF picker — search-as-you-type against /api/gifs/search with a
 * 400ms debounce, previews streamed through the same-origin media proxy
 * (?variant=small downsized rendition). SELECTS only: the parent does the
 * sending. Authenticated members of non-E2EE rooms only (parent gates this).
 * Degrades gracefully: "unconfigured"/"invalid-key" answers show a specific
 * actionable message; "network" keeps the generic retry hint.
 */
export function GifPicker({ onPick, disabled }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [gifs, setGifs] = useState<GifThumb[]>([]);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [configError, setConfigError] = useState<"unconfigured" | "invalid-key" | null>(null);
  const timerRef = useRef<number | undefined>(undefined);

  /* Esc closes the picker while it is open (outside-click shield handles the rest). */
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  /* Stop any pending debounce when the picker unmounts. */
  useEffect(() => () => window.clearTimeout(timerRef.current), []);

  const search = async (query: string) => {
    try {
      const res = await fetch(`/api/gifs/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as SearchResponse;
      if (data.error === "unconfigured" || data.error === "invalid-key") {
        /* Specific, actionable message for the site admin — not a generic failure. */
        setGifs([]);
        setFailed(false);
        setConfigError(data.error);
        return;
      }
      if (data.error === "network") throw new Error(data.error);
      setGifs(data.gifs ?? []);
      setFailed(false);
      setConfigError(null);
    } catch {
      setGifs([]);
      setFailed(true);
      setConfigError(null);
    } finally {
      setLoading(false);
    }
  };

  /** 400ms debounced search — typing restarts the timer, emptying resets. */
  const onQuery = (value: string) => {
    setQ(value);
    window.clearTimeout(timerRef.current);
    const query = value.trim();
    if (!query) {
      setGifs([]);
      setLoading(false);
      setFailed(false);
      setConfigError(null);
      return;
    }
    setLoading(true);
    timerRef.current = window.setTimeout(() => void search(query), DEBOUNCE_MS);
  };

  const pick = (gifId: string) => {
    setOpen(false);
    onPick(gifId);
  };

  const query = q.trim();

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        className="btn btn-ghost btn-icon size-10 shrink-0 rounded-xl"
        aria-label="GIF"
        title="GIF"
      >
        <ImagePlay className="size-[18px]" />
      </button>
      {open ? (
        <>
          {/* Outside-click shield (chat-list menu pattern). */}
          <button type="button" className="fixed inset-0 z-30 cursor-default" onClick={() => setOpen(false)} aria-hidden="true" tabIndex={-1} />
          <div className="pop-in absolute bottom-full mb-2 start-0 z-40 w-80 rounded-2xl border border-line bg-surface p-2 shadow-float sm:w-96">
            <input
              type="search"
              value={q}
              onChange={(e) => onQuery(e.target.value)}
              className="input h-9"
              placeholder={t.gif.search}
              aria-label={t.gif.search}
              dir="auto"
            />
            <div className="mt-2 max-h-72 overflow-y-auto no-scrollbar">
              {!query ? (
                <p className="px-2 py-6 text-center text-sm text-muted">{t.gif.hint}</p>
              ) : loading ? (
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {Array.from({ length: 6 }, (_, i) => (
                    <div key={i} className="h-28 animate-pulse rounded-lg bg-surface-3" />
                  ))}
                </div>
              ) : failed ? (
                <p className="px-2 py-6 text-center text-sm text-rose-ink">{t.gif.error}</p>
              ) : configError === "unconfigured" ? (
                <p className="px-2 py-6 text-center text-sm text-muted">{t.gif.unconfigured}</p>
              ) : configError === "invalid-key" ? (
                <p className="px-2 py-6 text-center text-sm text-muted">{t.gif.invalidKey}</p>
              ) : gifs.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-muted">{t.gif.empty}</p>
              ) : (
                <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                  {gifs.map((g) => (
                    <button key={g.id} type="button" onClick={() => pick(g.id)} title={g.title || "GIF"} className="group relative overflow-hidden rounded-lg">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={`/api/gifs/media/${g.id}?variant=small`}
                        alt={g.title || "GIF"}
                        loading="lazy"
                        className="h-28 w-full object-cover transition group-hover:ring-2 group-hover:ring-accent"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="mt-2 text-center text-[10px] text-faint">{t.gif.by}</p>
          </div>
        </>
      ) : null}
    </div>
  );
}
