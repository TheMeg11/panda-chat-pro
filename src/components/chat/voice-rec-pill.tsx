"use client";

/**
 * v2.4.1 — Animorio "Voice recording button" adapted for PandaChat Pro.
 *
 * Visual/behavioral reference: https://animorio.com/en/animations/voice-recording-button/
 * (license: personal & client-site use — re-implemented for this app's design
 * system, not redistributed as a standalone component.)
 *
 * What was adapted from the reference implementation (script.js/style.css):
 * - the recording pill that expands out of the microphone via clip-path
 *   (~550ms expo-out reveal, ~420ms power-in collapse, rounded 999px),
 * - the discard bin with the red hot state, the tabular MM:SS timer,
 * - the thin scrolling waveform canvas (5px steps, 2.6px rounded bars, newest
 *   white / older violet, left-edge fade, flatten-on-stop),
 * - the breathing violet glow under the pill, amplitude-driven via a smoothed
 *   level, and the microphone button that grows slightly with the voice.
 * Differences: no GSAP (WAAPI + a single rAF loop instead), no scripted
 * autopilot/transcript demo, real microphone RMS (AnalyserNode) drives the
 * bars, and stopping finalizes through PandaChat Pro's existing send flow.
 */

import { useEffect, useRef } from "react";
import { Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const SAMPLE = 0.07; // seconds per waveform bar (reference value)
const STEP = 5; // px between bars
const BAR_W = 2.6;

export function RecordingPill({
  open,
  closing,
  elapsed,
  getLevel,
  onDiscard,
  onClosed,
  reduced,
}: {
  /** pill is visible (recording or playing its close animation) */
  open: boolean;
  /** stop/discard pressed → collapse, then onClosed */
  closing: boolean;
  elapsed: number;
  getLevel: () => number;
  onDiscard: () => void;
  onClosed: () => void;
  reduced: boolean;
}) {
  const pillRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glowRef = useRef<HTMLDivElement | null>(null);
  const closeDoneRef = useRef(false);

  // The close animation completes → tell the parent to finalize (send).
  useEffect(() => {
    if (open && closing && !closeDoneRef.current) {
      closeDoneRef.current = true;
      const t = setTimeout(onClosed, reduced ? 260 : 700);
      return () => clearTimeout(t);
    }
    if (!open) closeDoneRef.current = false;
  }, [open, closing, onClosed, reduced]);

  // Open/close reveal (clip-path + content fade) — CSS transitions driven by
  // the is-open class; direction-aware via the form's dir (globals.css).
  useEffect(() => {
    const pill = pillRef.current;
    if (!pill || !open) return;
    // Force a frame with the collapsed clip before opening, so the transition
    // always plays even when React mounts us directly in the open state.
    pill.classList.remove("is-open");
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (pillRef.current) pillRef.current.classList.add("is-open");
      }),
    );
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // The single rAF loop: real mic level → waveform history, glow breathing,
  // pill --lv tint, flatten factor on close.
  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    const pill = pillRef.current;
    if (!canvas || !pill) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const st = { flat: 0 };
    const hist: number[] = [];
    let w = 0;
    let h = 0;
    let dpr = 1;
    let n = 0;
    let sampleT = 0;
    let smooth = 0;
    let last = performance.now();
    let raf = 0;
    const still = Array.from({ length: 80 }, (_, i) => 0.25 + 0.6 * Math.abs(Math.sin(i * 1.7) * Math.sin(i * 0.43)));

    const size = () => {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width;
      h = r.height;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      n = Math.max(4, Math.floor(w / STEP));
      while (hist.length < n + 2) hist.unshift(0);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(canvas);

    const draw = () => {
      if (!w) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const rtl = getComputedStyle(pill).direction === "rtl";
      const mid = h / 2;
      for (let k = 0; k < n + 1; k++) {
        const v = reduced ? still[k % still.length] : hist[hist.length - 1 - k] || 0;
        const dist = (k + (reduced ? 0 : sampleT / SAMPLE)) * STEP + 2.6;
        const x = rtl ? dist : w - dist;
        if (x < -3 || x > w + 3) continue;
        const bh = Math.max(2, v * h * 0.92 * st.flat + 2 * (1 - st.flat));
        // fade toward the far edge (left in LTR, right in RTL)
        const edge = Math.min(1, (rtl ? w - x : x) / 28);
        ctx.globalAlpha = Math.max(0, edge) * (k === 0 ? 1 : 0.55 + 0.45 * (1 - k / n));
        ctx.fillStyle = k < 3 ? "#ffffff" : "rgb(142 134 255)";
        const y = mid - bh / 2;
        if (ctx.roundRect) {
          ctx.beginPath();
          ctx.roundRect(x, y, BAR_W, bh, 1.3);
          ctx.fill();
        } else {
          ctx.fillRect(x, y, BAR_W, bh);
        }
      }
      ctx.globalAlpha = 1;
    };

    const tick = (now: number) => {
      const dt = Math.min(now - last, 100) / 1000;
      last = now;
      const level = reduced ? 0 : getLevel();
      sampleT += dt;
      while (sampleT >= SAMPLE) {
        sampleT -= SAMPLE;
        hist.push(level);
        if (hist.length > 400) hist.shift();
      }
      smooth += (level - smooth) * Math.min(1, dt * 12);
      // flatten: bars rise on open, collapse to a line while closing
      const flatTarget = closing ? 0 : 1;
      st.flat += (flatTarget - st.flat) * Math.min(1, dt * (closing ? 7 : 9));
      if (!reduced) {
        pill.style.setProperty("--lv", (smooth * st.flat).toFixed(3));
        const glow = glowRef.current;
        if (glow) {
          glow.style.opacity = String(Math.min(1, (closing ? 0 : 1) * (0.4 + 0.85 * smooth)));
          glow.style.transform = `scaleX(${(0.9 + 0.14 * smooth).toFixed(3)}) scaleY(${(0.72 + 0.55 * smooth).toFixed(3)})`;
        }
      }
      draw();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [open, closing, getLevel, reduced]);

  if (!open) return null;

  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(Math.floor(elapsed % 60)).padStart(2, "0");

  return (
    <>
      <div ref={glowRef} className="pc-glow" aria-hidden="true" />
      <div ref={pillRef} className="pc-rec" role="group" aria-label="Recording">
        <button
          type="button"
          onClick={onDiscard}
          className="pc-rec-bin"
          aria-label="Discard recording"
        >
          <Trash2 className="size-[18px]" aria-hidden="true" />
        </button>
        <span className="pc-rec-time" dir="ltr">
          {mm}:{ss}
        </span>
        <canvas ref={canvasRef} className="pc-rec-wave" aria-hidden="true" />
      </div>
    </>
  );
}

/**
 * The composer's microphone button that morphs into stop while recording:
 * press compression → spring back (reference's back.out feel via WAAPI
 * keyframes), icon cross-fade with rotation, violet ring, slight growth with
 * the live voice level.
 */
export function MicStopButton({
  recording,
  onStart,
  onStop,
  disabled,
  micLabel,
  stopLabel,
  className,
  getLevel,
}: {
  recording: boolean;
  onStart: () => void;
  onStop: () => void;
  disabled?: boolean;
  micLabel: string;
  stopLabel: string;
  className?: string;
  getLevel?: () => number;
}) {
  const btnRef = useRef<HTMLButtonElement | null>(null);

  // Press + spring-back whenever the state flips (reference: scale .9 →
  // back.out(2.6) ≈ overshoot cubic-bezier).
  useEffect(() => {
    const el = btnRef.current;
    if (!el || reducedMotionCheck()) return;
    el.animate(
      [
        { transform: "scale(0.9)" },
        { transform: "scale(1.045)", offset: 0.55 },
        { transform: "scale(1)" },
      ],
      { duration: 520, easing: "cubic-bezier(0.34, 1.56, 0.64, 1)" },
    );
    // Ring pulse on entering recording.
    if (recording) {
      el.animate(
        [{ boxShadow: "0 0 0 0px rgba(142,134,255,0.28)" }, { boxShadow: "0 0 0 6px rgba(142,134,255,0.16)" }],
        { duration: 400, easing: "ease-out", fill: "forwards" },
      );
    }
  }, [recording]);

  // Subtle amplitude growth while recording (reference: scale 1 + .035*smooth).
  useEffect(() => {
    if (!recording || !getLevel || reducedMotionCheck()) return;
    let raf = 0;
    let last = performance.now();
    let smooth = 0;
    const tick = (now: number) => {
      const dt = Math.min(now - last, 100) / 1000;
      last = now;
      smooth += (getLevel() - smooth) * Math.min(1, dt * 12);
      const el = btnRef.current;
      if (el) el.style.setProperty("--lv-scale", (1 + 0.035 * smooth).toFixed(3));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [recording, getLevel]);

  return (
    <button
      ref={btnRef}
      type="button"
      onClick={recording ? onStop : onStart}
      disabled={disabled}
      aria-pressed={recording}
      aria-label={recording ? stopLabel : micLabel}
      title={recording ? stopLabel : micLabel}
      className={cn("pc-mic btn btn-icon shrink-0 rounded-xl", recording ? "btn-soft text-accent-ink" : "btn-primary", className)}
    >
      <span className={cn("pc-mic-face", recording ? "is-rec" : "")}>
        <MicIcon className="pc-mic-icon" />
        <StopIcon className="pc-mic-icon" />
      </span>
    </button>
  );
}

function reducedMotionCheck(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function MicIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <rect x="7.2" y="2.6" width="5.6" height="9.2" rx="2.8" />
      <path d="M4.6 9.4a5.4 5.4 0 0 0 10.8 0M10 14.8v2.6" />
    </svg>
  );
}

function StopIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" className={className} aria-hidden="true">
      <rect x="6.2" y="6.2" width="7.6" height="7.6" rx="2.2" fill="currentColor" stroke="none" />
    </svg>
  );
}
