"use client";

import { useEffect, useRef, useState, type ComponentType, type ReactNode, type SVGProps } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/* ═══════════════════════ Ported from the standalone About app ═══════════════════════ */

export type Icon = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string; strokeWidth?: number | string }>;

/** Converts latin digits to Persian digits */
export const toFa = (v: string | number) => String(v).replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);

/* ───────────── Tones (same pairs as the Panda Chat icon tiles) ───────────── */
export type Tone = "accent" | "lavender" | "sky" | "mint" | "amber" | "rose" | "surface";

export const toneClass: Record<Tone, string> = {
  accent: "bg-accent-soft text-accent-ink",
  lavender: "bg-lavender-soft text-accent-ink",
  sky: "bg-sky-soft text-sky-ink",
  mint: "bg-mint-soft text-mint-ink",
  amber: "bg-amber-soft text-amber-ink",
  rose: "bg-rose-soft text-rose-ink",
  surface: "bg-surface text-accent-ink shadow-soft",
};

export function IconTile({ icon: I, tone = "accent", className }: { icon: Icon; tone?: Tone; className?: string }) {
  return (
    <span className={cn("icon-tile", toneClass[tone], className)}>
      <I className="size-5" aria-hidden="true" />
    </span>
  );
}

/* ───────────── Section layout ───────────── */
export function Section({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={cn("scroll-mt-24 border-t border-line py-14 first:border-t-0 sm:py-16", className)}>
      {children}
    </section>
  );
}

export function SectionHead({
  icon: I,
  kicker,
  title,
  lead,
}: {
  icon: Icon;
  kicker: string;
  title: ReactNode;
  lead?: ReactNode;
}) {
  return (
    <div className="max-w-2xl">
      <p className="inline-flex items-center gap-2 text-xs font-extrabold text-accent-ink">
        <I className="size-4" aria-hidden="true" />
        {kicker}
      </p>
      <h2 className="mt-3 text-[1.65rem] font-extrabold text-ink sm:text-[2.1rem]">{title}</h2>
      {lead ? <p className="mt-3 text-[1.02rem] leading-8 text-muted">{lead}</p> : null}
    </div>
  );
}

export function SubHead({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn("text-lg font-extrabold text-ink", className)}>{children}</h3>;
}

/* ───────────── Small atoms ───────────── */
export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd
      dir="ltr"
      className="inline-flex h-6 min-w-6 items-center justify-center rounded-md border border-line-strong bg-surface px-1.5 font-mono text-[11px] font-bold text-ink-2 shadow-soft"
    >
      {children}
    </kbd>
  );
}

/** Copy-on-tap command chip with a transient inline «کپی شد» state (no global toaster). */
export function CommandChip({ cmd, className }: { cmd: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => (timer.current ? clearTimeout(timer.current) : undefined), []);

  const copy = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(cmd);
      } else {
        const ta = document.createElement("textarea");
        ta.value = cmd;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <button
      type="button"
      dir="ltr"
      title={`کپی ${cmd}`}
      onClick={copy}
      className={cn(
        "cursor-pointer rounded-lg border border-line bg-surface px-2.5 py-1 font-mono text-xs font-bold text-accent-ink shadow-soft transition hover:-translate-y-px hover:border-accent/40 hover:shadow-card",
        className,
      )}
    >
      {copied ? "کپی شد" : cmd}
    </button>
  );
}

/** Rounded icon + text row (used for feature bullet lists, as on Panda Chat) */
export function Point({ icon: I, tone = "sky", children }: { icon: Icon; tone?: Tone; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-[0.95rem] font-semibold leading-7 text-ink-2">
      <span className={cn("mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl", toneClass[tone])}>
        <I className="size-[18px]" aria-hidden="true" />
      </span>
      <span className="pt-1">{children}</span>
    </li>
  );
}

export function CheckItem({ children, tone = "mint" }: { children: ReactNode; tone?: "mint" | "rose" }) {
  return (
    <li className="flex items-start gap-2.5 text-sm leading-7 text-ink-2">
      <span
        className={cn(
          "mt-1 grid size-5 shrink-0 place-items-center rounded-full",
          tone === "mint" ? "bg-mint-soft text-mint-ink" : "bg-rose-soft text-rose-ink",
        )}
      >
        {tone === "mint" ? (
          <Check className="size-3" strokeWidth={3} aria-hidden="true" />
        ) : (
          <span className="block h-0.5 w-2.5 rounded-full bg-current" aria-hidden="true" />
        )}
      </span>
      <span>{children}</span>
    </li>
  );
}

/* ───────────── Numbered steps with dashed connector ───────────── */
const stepCols: Record<number, string> = { 3: "md:grid-cols-3", 4: "md:grid-cols-4" };

export function Steps({ steps }: { steps: { title: string; text: ReactNode }[] }) {
  return (
    <ol className={cn("relative grid gap-10 md:gap-6", stepCols[steps.length] ?? "md:grid-cols-3")}>
      <div
        className="absolute inset-x-[12%] top-7 hidden border-t-2 border-dashed border-line-strong md:block"
        aria-hidden="true"
      />
      {steps.map((s, i) => (
        <li key={s.title} className="relative text-center">
          <span className="relative mx-auto grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-xl font-extrabold text-on-accent shadow-card ring-8 ring-canvas">
            {toFa(i + 1)}
          </span>
          <h3 className="mt-5 text-base font-extrabold text-ink">{s.title}</h3>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-7 text-muted">{s.text}</p>
        </li>
      ))}
    </ol>
  );
}

/* ───────────── Fake (read-only) form field for sample cards ───────────── */
export function FakeField({
  label,
  placeholder,
  hint,
  optional,
}: {
  label: string;
  placeholder: string;
  hint?: string;
  optional?: boolean;
}) {
  return (
    <div>
      <p className="mb-1.5 flex items-center gap-2 text-[0.8125rem] font-bold text-ink-2">
        {label}
        {optional ? <span className="badge badge-neutral h-5 text-[0.65rem]">اختیاری</span> : null}
      </p>
      <div className="flex h-11 items-center rounded-xl border border-line-strong bg-surface px-3.5 text-[0.9rem] text-faint">
        {placeholder}
      </div>
      {hint ? <p className="mt-1.5 text-[0.78rem] leading-6 text-muted">{hint}</p> : null}
    </div>
  );
}

/* ═══════════════════════ Hooks (ported from the standalone app) ═══════════════════════ */

/** Scroll spy: returns the id of the section currently being read */
export function useScrollSpy(ids: string[], offset = 140) {
  const [active, setActive] = useState<string>(ids[0] ?? "");

  useEffect(() => {
    let frame = 0;
    const compute = () => {
      frame = 0;
      let current = ids[0] ?? "";
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top - offset <= 0) current = id;
      }
      // reached the bottom → last section
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        current = ids[ids.length - 1] ?? current;
      }
      setActive(current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(compute);
    };
    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [ids, offset]);

  return active;
}

/** Reading progress (0 → 1) */
export function useScrollProgress() {
  const [progress, setProgress] = useState(0);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    let frame = 0;
    const compute = () => {
      frame = 0;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0);
      setScrolled(window.scrollY > 600);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(compute);
    };
    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return { progress, scrolled };
}
