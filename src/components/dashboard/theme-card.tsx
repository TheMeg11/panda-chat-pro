"use client";

import { useEffect } from "react";
import { MonitorSmartphone, Moon, Palette, Sun } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { applyThemeMode, applyThemePalette, useThemeSnapshot, type ThemeMode } from "@/lib/local-store";
import { cn } from "@/lib/utils";

/**
 * Appearance card on the settings page: mode (light / dark / auto) plus a
 * color-palette picker. Everything is device-local (localStorage) and applied
 * live by flipping the `dark` class and the `data-palette` attribute on
 * <html> — the same keys the pre-paint script in layout.tsx reads, so the
 * choice survives reloads without a flash of the wrong theme.
 *
 * Palettes (globals.css): "lavender" is the v2.0 default and needs no
 * attribute; the others set data-palette on the root element. Dark variants
 * of every palette are muted/desaturated on purpose (comfortable at night).
 *
 * State lives in lib/local-store (useThemeSnapshot) — the same
 * useSyncExternalStore idiom as NotificationsCard; the moon/sun ThemeToggle
 * elsewhere also mutates the `dark` class, and the store's MutationObserver
 * keeps this card honest.
 */

const MODES: Array<{ id: ThemeMode; icon: typeof Sun }> = [
  { id: "light", icon: Sun },
  { id: "dark", icon: Moon },
  { id: "system", icon: MonitorSmartphone },
];

const PALETTES: Array<{
  id: string;
  labelKey: "paletteLavender" | "palettePanda" | "paletteOcean" | "palettePlum";
  emoji: string;
  light: [string, string, string];
  dark: [string, string, string];
}> = [
  {
    id: "lavender",
    labelKey: "paletteLavender",
    emoji: "🪻",
    light: ["#5b3bff", "#6a4cff", "#eeebff"],
    dark: ["#6a4dff", "#6a4dff", "#252a53"],
  },
  {
    id: "panda",
    labelKey: "palettePanda",
    emoji: "🐼",
    light: ["#16a06d", "#16a06d", "#e6f7f0"],
    dark: ["#4e9f7d", "#4e9f7d", "#252a53"],
  },
  {
    id: "ocean",
    labelKey: "paletteOcean",
    emoji: "🌊",
    light: ["#0e7fc4", "#0e7fc4", "#e6f2fc"],
    dark: ["#4d8fb8", "#4d8fb8", "#252a53"],
  },
  {
    id: "plum",
    labelKey: "palettePlum",
    emoji: "🍇",
    light: ["#ab3a6b", "#ab3a6b", "#fbeef4"],
    dark: ["#a25f7f", "#a25f7f", "#252a53"],
  },
];

export function ThemeCard() {
  const { t, lang } = useI18n();
  const snap = useThemeSnapshot();

  // While on "system", follow the device live (the pre-paint script only
  // handles page loads).
  useEffect(() => {
    if (snap.mode !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      document.documentElement.classList.toggle("dark", mq.matches);
      document.documentElement.style.colorScheme = mq.matches ? "dark" : "light";
      window.dispatchEvent(new Event("pc-theme-change"));
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [snap.mode]);

  const swatch = (p: (typeof PALETTES)[number]) => (snap.isDark ? p.dark : p.light);

  return (
    <section id="theme" className="card scroll-mt-20 p-5 sm:p-6" aria-labelledby="theme-title">
      <h2 id="theme-title" className="flex items-center gap-2 font-extrabold text-ink">
        <Palette className="size-4 text-accent-ink" />
        {t.theme.title}
      </h2>
      <p className="mt-1 text-sm text-muted">{t.theme.subtitle}</p>

      {/* Mode: light / dark / auto ------------------------------------- */}
      <p className="mt-4 text-xs font-bold text-ink-2">{t.theme.mode}</p>
      <div
        role="radiogroup"
        aria-label={t.theme.mode}
        className="mt-2 grid grid-cols-3 gap-2"
        style={{ maxWidth: 420 }}
      >
        {MODES.map((m) => {
          const Icon = m.icon;
          const active = snap.mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => applyThemeMode(m.id)}
              className={cn(
                "flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-xs font-bold transition-colors",
                active
                  ? "border-accent bg-accent-soft text-accent-ink"
                  : "border-line bg-surface-2 text-muted hover:border-line-strong hover:text-ink",
              )}
              title={m.id === "system" ? t.theme.systemHint : undefined}
            >
              <Icon className="size-4" />
              {m.id === "light" ? t.theme.light : m.id === "dark" ? t.theme.dark : t.theme.system}
            </button>
          );
        })}
      </div>
      {snap.mode === "system" ? <p className="mt-2 text-xs text-faint">{t.theme.systemHint}</p> : null}

      {/* Palette: color themes ----------------------------------------- */}
      <p className="mt-5 text-xs font-bold text-ink-2">{t.theme.palette}</p>
      <div className="mt-2 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {PALETTES.map((p) => {
          const [accent, bubble, soft] = swatch(p);
          const active = snap.palette === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => applyThemePalette(p.id)}
              className={cn(
                "rounded-xl border p-2.5 text-start transition-colors",
                active
                  ? "border-accent bg-accent-soft"
                  : "border-line bg-surface-2 hover:border-line-strong",
              )}
            >
              <span className="flex items-center gap-1.5" aria-hidden>
                <span
                  className="inline-block size-5 rounded-full border border-white/60"
                  style={{ background: accent }}
                />
                <span
                  className="inline-block size-5 rounded-full border"
                  style={{ background: bubble, borderColor: soft }}
                />
                <span className="text-base leading-none">{p.emoji}</span>
              </span>
              <span className="mt-1.5 block truncate text-xs font-bold text-ink">
                {t.theme[p.labelKey]}
                {p.id === "lavender" ? <span className="text-faint"> · {t.theme.defaultTag}</span> : null}
              </span>
            </button>
          );
        })}
      </div>

      {/* Live preview: real CSS variables, updates with every switch ---- */}
      <p className="mt-5 text-xs font-bold text-ink-2">{t.theme.preview}</p>
      <div className="mt-2 rounded-xl border border-line bg-canvas-2 p-3.5">
        <div className="flex flex-col gap-2">
          <div
            dir="auto"
            className="max-w-[80%] self-start rounded-2xl px-3.5 py-2 text-sm text-ink"
            style={{ background: "var(--bubble-in)", border: "1px solid var(--bubble-in-line)" }}
          >
            {lang === "fa" ? "سلام! این پیش‌نمایش تم است 🐼" : "Hi! This is a theme preview 🐼"}
          </div>
          <div
            dir="auto"
            className="max-w-[80%] self-end rounded-2xl px-3.5 py-2 text-sm"
            style={{
              background: "var(--bubble-out)",
              border: "1px solid var(--bubble-out-line)",
              color: "var(--bubble-out-ink)",
            }}
          >
            {lang === "fa" ? "و این پیام خودت است ✨" : "And this is your own message ✨"}
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="badge bg-accent text-on-accent">{t.theme.preview}</span>
          <span className="badge bg-accent-soft text-accent-ink">{t.theme.savedLocal}</span>
          <span className="badge bg-mint-soft text-mint-ink">{t.theme.light}</span>
        </div>
      </div>
    </section>
  );
}
