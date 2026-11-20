"use client";

/**
 * v2.3.0 — Telegram-style voice messages.
 *
 * `useVoiceRecorder` drives the composer's record flow: tap the mic → the
 * composer swaps to a recording bar (pulsing dot + timer + live bars) with
 * stop/send/trash buttons → stop keeps a preview → send hands the recorded
 * File to the normal send path (it rides the existing attachment upload,
 * including E2EE). `VoicePlayer` renders voice attachments as a Telegram-like
 * chip (play/pause, deterministic waveform, seekable progress, duration) with
 * the classic `duration === Infinity` MediaRecorder-WebM workaround.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

export type VoicePhase = "idle" | "recording" | "review";

const MIMES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

export function formatSecs(total: number): string {
  const s = Math.max(0, Math.floor(total));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export type MicError = "denied" | "busy" | "unsupported";

/** Map a recorder/getUserMedia failure to a precise, honest message — a
 * granted permission that still fails is NOT "permission denied". */
function classifyMicError(err: unknown, precheckFailed: boolean): MicError {
  const name = (err as DOMException | undefined)?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError") return "denied";
  if (name === "NotReadableError" || name === "AbortError" || name === "TrackStartError") return "busy";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "unsupported";
  return precheckFailed || name ? "unsupported" : "unsupported";
}

export function useVoiceRecorder() {
  const [phase, setPhase] = useState<VoicePhase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [micError, setMicError] = useState<MicError | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const blobRef = useRef<Blob | null>(null);

  const cleanupStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);
  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const start = useCallback(async () => {
    setMicError(null);
    const precheckFailed = !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined";
    try {
      if (precheckFailed) throw new DOMException("recording unsupported", "NotSupportedError");
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      } catch (err) {
        // Some Android WebViews reject rich constraints — retry plain.
        if ((err as DOMException)?.name === "OverconstrainedError" || (err as DOMException)?.name === "NotFoundError") {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        } else {
          throw err;
        }
      }
      streamRef.current = stream;
      const mimeType = MIMES.find((m) => {
        try {
          return MediaRecorder.isTypeSupported(m);
        } catch {
          return false;
        }
      });
      // Constructor with an exotic mime can throw on some builds — fall back
      // to the browser default before giving up.
      let rec: MediaRecorder;
      try {
        rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      } catch {
        rec = new MediaRecorder(stream);
      }
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        clearTimer();
        cleanupStream();
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || mimeType || "audio/webm" });
        blobRef.current = blob;
        setUrl((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(blob);
        });
        setDuration(Math.max(1, Math.round((Date.now() - startedRef.current) / 1000)));
        setPhase("review");
      };
      try {
        rec.start(250);
      } catch {
        rec.start();
      }
      recRef.current = rec;
      startedRef.current = Date.now();
      setElapsed(0);
      setPhase("recording");
      clearTimer();
      timerRef.current = setInterval(() => setElapsed(Math.floor((Date.now() - startedRef.current) / 1000)), 250);
    } catch (err) {
      cleanupStream();
      // Honest mapping: granted-but-failing is never reported as "denied".
      setMicError(classifyMicError(err, precheckFailed));
      setPhase("idle");
    }
  }, [cleanupStream, clearTimer]);

  const stop = useCallback(() => {
    if (recRef.current?.state === "recording") recRef.current.stop();
  }, []);

  /** Discard the current (or in-flight) recording and return to idle. */
  const discard = useCallback(() => {
    if (recRef.current) {
      recRef.current.onstop = null;
      try {
        if (recRef.current.state !== "inactive") recRef.current.stop();
      } catch {
        /* already stopped */
      }
      recRef.current = null;
    }
    clearTimer();
    cleanupStream();
    setUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    blobRef.current = null;
    setElapsed(0);
    setDuration(0);
    setPhase("idle");
  }, [cleanupStream, clearTimer]);

  /** Stop the recorder (if needed) and hand the recorded clip to the caller. */
  const take = useCallback((): File | null => {
    const blob = blobRef.current;
    if (!blob) return null;
    const secs = Math.max(1, Math.round((Date.now() - startedRef.current) / 1000));
    const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
    return new File([blob], `voice-${secs}s-${Date.now().toString(36)}.${ext}`, { type: blob.type || "audio/webm" });
  }, []);

  // Unmount (or navigating away): never leave the mic or the timer running.
  useEffect(
    () => () => {
      if (recRef.current) {
        recRef.current.onstop = null;
        try {
          if (recRef.current.state !== "inactive") recRef.current.stop();
        } catch {
          /* ignore */
        }
      }
      clearTimer();
      cleanupStream();
    },
    [cleanupStream, clearTimer],
  );

  return { phase, elapsed, duration, url, micError, start, stop, discard, take };
}

/** Deterministic pseudo-waveform (same seed → same bars). */
function barHeights(seed: number, count = 28): number[] {
  let x = seed % 2147483647 || 1;
  return Array.from({ length: count }, () => {
    x = (x * 48271) % 2147483647;
    return 28 + Math.round(((x >> 8) % 68));
  });
}

export function VoiceBars({
  seed,
  progress = 0,
  recording = false,
  className,
}: {
  seed: number;
  progress?: number;
  recording?: boolean;
  className?: string;
}) {
  const bars = useMemo(() => barHeights(seed), [seed]);
  return (
    <div className={cn("flex h-7 min-w-0 flex-1 items-center gap-[2px]", className)} aria-hidden="true">
      {bars.map((h, i) => {
        const on = recording || (i / bars.length) * 100 <= progress;
        return (
          <span
            key={i}
            className={cn(
              "w-[3px] shrink-0 rounded-full transition-[background-color,opacity] duration-200",
              on ? "bg-current" : "bg-current opacity-30",
            )}
            style={{ height: `${h}%` }}
          />
        );
      })}
    </div>
  );
}

/**
 * Telegram-style voice bubble: play/pause, seekable waveform, time. Handles
 * the WebM `Infinity` duration quirk by probing to the end once and seeking
 * back (same trick Telegram's web client uses).
 */
export function VoicePlayer({ src, seed, mine }: { src: string; seed: number; mine: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) {
      void a.play().catch(() => setPlaying(false));
    } else {
      a.pause();
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !dur) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    a.currentTime = ratio * dur;
    setCur(a.currentTime);
  };

  const progress = dur > 0 ? Math.min(100, (cur / dur) * 100) : 0;

  return (
    <span
      className={cn(
        "mb-1 flex w-64 max-w-full items-center gap-2.5 rounded-xl px-2.5 py-2",
        mine ? "bg-white/15" : "border border-line bg-surface-2",
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-full text-white transition-transform active:scale-95",
          mine ? "bg-white/25 hover:bg-white/35" : "bg-accent hover:bg-accent-2",
        )}
        aria-label={playing ? "Pause" : "Play"}
      >
        {playing ? <Pause className="size-4" /> : <Play className="size-4 -scale-x-100 rtl:scale-x-100" />}
      </button>
      <div className="min-w-0 flex-1 cursor-pointer py-1" onClick={seek} role="slider" aria-valuemin={0} aria-valuemax={dur || 0} aria-valuenow={cur}>
        <VoiceBars seed={seed} progress={progress} className={mine ? "text-white" : "text-accent-ink"} />
      </div>
      <span className={cn("shrink-0 text-[11px] font-semibold tabular-nums", mine ? "text-white/85" : "text-muted")} dir="ltr">
        {formatSecs(playing || cur > 0 ? cur : dur)}
      </span>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        className="hidden"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCur(0);
        }}
        onTimeUpdate={(e) => setCur(e.currentTarget.currentTime || 0)}
        onLoadedMetadata={(e) => {
          // WebM blobs recorded by MediaRecorder report duration === Infinity
          // until they have been probed once — nudge to the far end and back.
          const a = e.currentTarget;
          if (a.duration === Infinity || Number.isNaN(a.duration)) {
            const probe = () => {
              a.removeEventListener("timeupdate", probe);
              setDur(a.duration === Infinity ? 0 : a.duration);
              a.currentTime = 0;
            };
            a.addEventListener("timeupdate", probe);
            a.currentTime = 1e101;
          } else {
            setDur(a.duration);
          }
        }}
      />
    </span>
  );
}
