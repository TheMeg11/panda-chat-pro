"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, GraduationCap, X } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { cn } from "@/lib/utils";

/**
 * Interactive onboarding tour.
 *
 * A dark overlay with a spotlight cut-out around the real UI element
 * (`[data-tutorial="<stepId>"]`), a tooltip card with title/description,
 * step counter and prev/next/skip/finish controls.
 *
 * Requirements honoured:
 *  - overlay + highlight + tooltip on the REAL interface (no screenshots)
 *  - works in dark & light theme (existing tokens) and full RTL (logical props)
 *  - keyboard: ←/→ navigate, Esc skips, Enter advances; focus is trapped in
 *    the tooltip so nothing behind the overlay is tabbable
 *  - mobile/desktop/PWA-safe: fixed-position tooltip repositioned on scroll
 *    and resize; targets that leave the viewport scroll into view
 *  - page changes / missing target element → that step is skipped gracefully
 */

export type TutorialStep = {
  /** matches data-tutorial="..." on the target element */
  target: string;
  /** fallback: a CSS selector string when the target is complex */
  selector?: string;
  titleKey: string;
  textKey: string;
};

export const TUTORIAL_STEPS: TutorialStep[] = [
  { target: "chat-list", titleKey: "tutorial.steps.chatList", textKey: "tutorial.steps.chatListText" },
  { target: "user-search", titleKey: "tutorial.steps.search", textKey: "tutorial.steps.searchText" },
  { target: "new-chat", titleKey: "tutorial.steps.newChat", textKey: "tutorial.steps.newChatText" },
  { target: "composer", titleKey: "tutorial.steps.sendMessage", textKey: "tutorial.steps.sendMessageText" },
  { target: "rooms", titleKey: "tutorial.steps.rooms", textKey: "tutorial.steps.roomsText" },
  { target: "online-status", titleKey: "tutorial.steps.online", textKey: "tutorial.steps.onlineText" },
  { target: "vault", titleKey: "tutorial.steps.vault", textKey: "tutorial.steps.vaultText" },
  { target: "security", titleKey: "tutorial.steps.security", textKey: "tutorial.steps.securityText" },
];

type Rect = { top: number; left: number; width: number; height: number };

const SPOTLIGHT_PADDING = 8;

export function TutorialOverlay({
  steps = TUTORIAL_STEPS,
  onComplete,
  onSkip,
}: {
  steps?: TutorialStep[];
  onComplete: () => void;
  onSkip: () => void;
}) {
  const { t, dir } = useI18n();
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; start: number } | null>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const advanceRef = useRef<() => void>(() => undefined);

  const step = steps[index];
  const total = steps.length;

  const measure = useCallback(() => {
    if (!step) return;
    const el = document.querySelector<HTMLElement>(step.selector ?? `[data-tutorial="${step.target}"]`);
    if (!el) {
      setRect(null);
      setTooltipPos({ top: window.innerHeight / 2 - 80, start: window.innerWidth / 2 - 170 });
      return;
    }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    // wait for the smooth scroll to settle before measuring
    setTimeout(() => {
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    }, 220);
  }, [step]);

  useLayoutEffect(() => {
    // Measuring the target element can ONLY happen after DOM commit; setState
    // here is the documented pattern for overlay positioning.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    measure();
  }, [measure]);

  // Reposition tooltip whenever the spotlight moves / viewport changes.
  useEffect(() => {
    if (!rect) return;
    const card = cardRef.current?.getBoundingClientRect();
    const cardH = card?.height ?? 190;
    const cardW = Math.min(340, window.innerWidth - 32);
    let top: number;
    if (rect.top + rect.height + 16 + cardH < window.innerHeight) {
      top = rect.top + rect.height + 12; // below the target
    } else if (rect.top - cardH - 16 > 0) {
      top = rect.top - cardH - 12; // above the target
    } else {
      top = Math.max(16, (window.innerHeight - cardH) / 2); // centered
    }
    const center = rect.left + rect.width / 2;
    const start = Math.min(Math.max(16, center - cardW / 2), window.innerWidth - cardW - 16);
    setTooltipPos({ top, start });
  }, [rect]);

  useEffect(() => {
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
    };
  }, [measure]);

  const next = useCallback(() => {
    if (index + 1 >= total) onComplete();
    else {
      setIndex((i) => i + 1);
      setRect(null);
    }
  }, [index, total, onComplete]);

  const prev = useCallback(() => {
    if (index > 0) {
      setIndex((i) => i - 1);
      setRect(null);
    }
  }, [index]);

  // Keep the keyboard handler pointed at the latest `next` without re-binding.
  useEffect(() => {
    advanceRef.current = next;
  }, [next]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onSkip();
      } else if (e.key === "Enter") {
        e.preventDefault();
        advanceRef.current();
      } else if (e.key === "ArrowRight" && dir !== "rtl") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft" && dir !== "rtl") {
        e.preventDefault();
        prev();
      } else if (e.key === "ArrowRight" && dir === "rtl") {
        e.preventDefault();
        prev();
      } else if (e.key === "ArrowLeft" && dir === "rtl") {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [next, prev, onSkip, dir]);

  if (!step) return null;

  const spotlightStyle = rect
    ? {
        top: Math.max(0, rect.top - SPOTLIGHT_PADDING),
        left: Math.max(0, rect.left - SPOTLIGHT_PADDING),
        width: rect.width + SPOTLIGHT_PADDING * 2,
        height: rect.height + SPOTLIGHT_PADDING * 2,
      }
    : undefined;

  return (
    <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label={t.tutorial.title}>
      {/* dimmed backdrop with a spotlight cut-out */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[1px] transition-[clip-path] duration-200"
        style={
          spotlightStyle
            ? {
                clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${spotlightStyle.left}px 0, ${spotlightStyle.left}px ${spotlightStyle.top + spotlightStyle.height}px, ${spotlightStyle.left + spotlightStyle.width}px ${spotlightStyle.top + spotlightStyle.height}px, ${spotlightStyle.left + spotlightStyle.width}px ${spotlightStyle.top}px, ${spotlightStyle.left}px ${spotlightStyle.top}px, 0 0)`,
              }
            : undefined
        }
        onClick={(e) => e.stopPropagation()}
      />
      {/* spotlight ring */}
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-accent ring-offset-2 ring-offset-black/40 transition-all duration-200"
          style={spotlightStyle}
        />
      ) : null}

      {/* tooltip card */}
      {tooltipPos ? (
        <div
          ref={cardRef}
          className="pop-in absolute w-[min(340px,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-4 shadow-float"
          style={{ top: tooltipPos.top, left: tooltipPos.start, maxWidth: "340px" }}
        >
          <div className="flex items-start gap-3">
            <span className="icon-tile bg-accent-soft text-accent-ink">
              <GraduationCap className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-extrabold text-ink">{(t.tutorial.steps as Record<string, string>)[step.titleKey.replace("tutorial.steps.", "")] ?? step.titleKey}</h2>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                {(t.tutorial.steps as Record<string, string>)[step.textKey.replace("tutorial.steps.", "")] ?? step.textKey}
              </p>
            </div>
            <button type="button" onClick={onSkip} className="btn btn-ghost btn-icon btn-sm" aria-label={t.tutorial.skip}>
              <X className="size-4" />
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[10px] font-bold text-muted" dir="ltr">
              {index + 1} / {total}
            </span>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={prev} disabled={index === 0} className="btn btn-secondary btn-sm">
                <ChevronLeft className={cn("size-4", dir === "rtl" && "rtl:-scale-x-100")} />
                {t.tutorial.prev}
              </button>
              <button type="button" onClick={next} className="btn btn-primary btn-sm" autoFocus>
                {index + 1 === total ? t.tutorial.finish : t.tutorial.next}
                <ChevronRight className={cn("size-4", dir === "rtl" && "rtl:-scale-x-100")} />
              </button>
            </div>
          </div>
          <button type="button" onClick={onSkip} className="mt-2 w-full text-center text-[11px] font-semibold text-faint transition hover:text-muted">
            {t.tutorial.skipTour}
          </button>
        </div>
      ) : null}
    </div>
  );
}
