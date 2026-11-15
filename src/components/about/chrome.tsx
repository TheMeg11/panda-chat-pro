"use client";

import Link from "next/link";
import {
  ArrowRight,
  ArrowUp,
  AtSign,
  Bot,
  CircleHelp,
  CircleUser,
  Layers,
  Lightbulb,
  ListChecks,
  MessagesSquare,
  MonitorSmartphone,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { PandaMark } from "@/components/brand";
import { toFa, useScrollProgress, useScrollSpy, type Icon } from "./ui";

/** The sections kept on the ported page (no overview/concepts/version entries). */
export const SECTIONS: { id: string; label: string; icon: Icon }[] = [
  { id: "start", label: "شروع کار", icon: Sparkles },
  { id: "rooms", label: "اتاق‌ها و داشبورد", icon: Layers },
  { id: "messaging", label: "گفتگو و پیام‌ها", icon: MessagesSquare },
  { id: "private", label: "گفتگوی خصوصی و چت مخفی", icon: AtSign },
  { id: "moderation", label: "مدیریت اتاق", icon: Wrench },
  { id: "telegram", label: "ربات تلگرام", icon: Bot },
  { id: "account", label: "حساب کاربری و نشست‌ها", icon: CircleUser },
  { id: "security", label: "امنیت و حریم خصوصی", icon: ShieldCheck },
  { id: "app", label: "اپلیکیشن، ظاهر و زبان", icon: MonitorSmartphone },
  { id: "limits", label: "محدودیت‌ها و قواعد", icon: ListChecks },
  { id: "tips", label: "توصیه‌های کاربردی", icon: Lightbulb },
  { id: "faq", label: "پرسش‌های پرتکرار", icon: CircleHelp },
];

const SECTION_IDS = SECTIONS.map((s) => s.id);

/* ───────────── In-app top bar ───────────── */
export function AppHeader() {
  const { progress } = useScrollProgress();

  return (
    <header className="glass sticky top-0 z-40 border-b border-line/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/dashboard"
            aria-label="پاندا چت — داشبورد"
            className="inline-flex items-center gap-2.5 rounded-xl outline-offset-4"
          >
            <PandaMark size={34} className="drop-shadow-[0_6px_14px_rgba(115,133,244,0.28)]" />
            <span className="truncate text-[1.06rem] font-extrabold leading-none text-ink">پاندا چت</span>
          </Link>
          <span className="hidden h-5 w-px bg-line-strong sm:block" aria-hidden="true" />
          <span className="hidden truncate text-sm font-bold text-muted sm:block">درباره سایت</span>
        </div>

        <div className="flex items-center gap-1.5">
          <Link href="/dashboard" className="btn btn-secondary ps-3">
            <ArrowRight className="size-4 rtl:-scale-x-100" aria-hidden="true" />
            بازگشت به داشبورد
          </Link>
        </div>
      </div>

      {/* reading progress */}
      <div className="absolute inset-x-0 -bottom-px h-[2px]" aria-hidden="true">
        <div
          className="h-full origin-right bg-gradient-to-l from-accent to-accent-2 transition-transform duration-150"
          style={{ transform: `scaleX(${progress})` }}
        />
      </div>
    </header>
  );
}

/* ───────────── Desktop sticky table of contents ───────────── */
export function Toc() {
  const active = useScrollSpy(SECTION_IDS);
  const { progress } = useScrollProgress();

  return (
    <nav
      aria-label="فهرست مطالب"
      className="no-scrollbar sticky top-16 max-h-[calc(100dvh-4rem)] overflow-y-auto py-10"
    >
      <p className="px-3 text-xs font-extrabold text-faint">در این صفحه</p>
      <ul className="mt-3 space-y-0.5">
        {SECTIONS.map(({ id, label, icon: I }) => {
          const isActive = active === id;
          return (
            <li key={id}>
              <a
                href={`#${id}`}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "group flex items-center gap-2.5 rounded-xl px-3 py-2 text-[0.84rem] font-semibold transition",
                  isActive ? "bg-accent-soft text-accent-ink" : "text-ink-2 hover:bg-surface-3 hover:text-ink",
                )}
              >
                <I
                  className={cn(
                    "size-4 shrink-0 transition",
                    isActive ? "text-accent-ink" : "text-faint group-hover:text-muted",
                  )}
                  aria-hidden="true"
                />
                <span className="truncate">{label}</span>
              </a>
            </li>
          );
        })}
      </ul>

      <div className="mx-3 mt-6 rounded-xl border border-line bg-surface p-3 shadow-soft">
        <div className="flex items-center justify-between text-[11px] font-bold text-muted">
          <span>میزان مطالعه</span>
          <span>{toFa(Math.round(progress * 100))}٪</span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-3">
          <div
            className="h-full rounded-full bg-gradient-to-l from-accent to-accent-2 transition-[width] duration-150"
            style={{ width: `${Math.max(4, progress * 100)}%` }}
          />
        </div>
      </div>
    </nav>
  );
}

/* ───────────── Mobile / tablet table of contents ───────────── */
export function MobileToc() {
  return (
    <nav aria-label="فهرست مطالب" className="card mt-8 p-4 lg:hidden">
      <p className="text-xs font-extrabold text-faint">در این صفحه</p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {SECTIONS.map(({ id, label, icon: I }) => (
          <li key={id}>
            <a
              href={`#${id}`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-xs font-bold text-ink-2 transition hover:border-line-strong hover:text-ink"
            >
              <I className="size-3.5 text-accent-ink" aria-hidden="true" />
              {label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/* ───────────── Back to top ───────────── */
export function BackToTop() {
  const { scrolled } = useScrollProgress();
  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="بازگشت به بالای صفحه"
      title="بازگشت به بالای صفحه"
      className={cn(
        "btn btn-secondary btn-icon fixed bottom-5 end-5 z-40 rounded-full shadow-card transition-all duration-300",
        scrolled ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
      )}
    >
      <ArrowUp className="size-[18px]" />
    </button>
  );
}
