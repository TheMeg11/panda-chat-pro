"use client";

import { useSyncExternalStore } from "react";

/**
 * SSR-safe live bindings to localStorage flags/JSON via useSyncExternalStore.
 * Mutators call notifyLocalStore() so every subscribed component re-renders
 * immediately (no setState-in-effect cascades).
 */

const listeners = new Set<() => void>();

export function notifyLocalStore() {
  for (const listener of listeners) listener();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

/** Live boolean flag (e.g. "pc-watermark" === "1"). */
export function useLocalFlag(key: string): boolean {
  return useSyncExternalStore(
    subscribe,
    () => {
      try {
        return localStorage.getItem(key) === "1";
      } catch {
        return false;
      }
    },
    () => false,
  );
}

/**
 * v1.5.3 FIX (React #185 "Maximum update depth exceeded"): getSnapshot MUST
 * return a STABLE identity between renders. The old version ran JSON.parse
 * on EVERY call, producing a fresh object each time — useSyncExternalStore
 * compares snapshots with Object.is, so any component bound to a NON-EMPTY
 * key re-rendered forever (the settings page crashed for every user who had
 * set up the hidden-chats vault; the page looked "broken" on open). The
 * parsed value is now cached per key and re-parsed only when the raw string
 * actually changes.
 */
const jsonCache = new Map<string, { raw: string | null; parsed: unknown }>();

/** exported for the identity-stability regression test */
export function stableJsonSnapshot(key: string): unknown {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(key);
  } catch {
    return null;
  }
  const cached = jsonCache.get(key);
  if (cached && cached.raw === raw) return cached.parsed;
  let parsed: unknown = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
  }
  jsonCache.set(key, { raw, parsed });
  return parsed;
}

/** Live JSON value; null when absent or during SSR. */
export function useLocalJson<T>(key: string): T | null {
  return useSyncExternalStore(
    subscribe,
    () => stableJsonSnapshot(key) as T | null,
    () => null,
  );
}

/** Sets (or removes) a flag and notifies subscribers. */
export function setLocalFlag(key: string, on: boolean) {
  try {
    if (on) localStorage.setItem(key, "1");
    else localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
  notifyLocalStore();
}

/* ------------------------------------------------------------------ */
/* Browser-notification preferences (device-local)                     */
/* ------------------------------------------------------------------ */

export type NotifyPrefs = {
  /** master switch — requires the browser's Notification permission */
  enabled: boolean;
  /** play a soft chime with each notification */
  sound: boolean;
  /** red unread dot on the site icon */
  badge: boolean;
  /** show message text inside the notification */
  preview: boolean;
};

const NOTIFY_PREFS_KEY = "pc-notify-prefs";
const DEFAULT_NOTIFY_PREFS: NotifyPrefs = { enabled: false, sound: true, badge: true, preview: true };

/** Reads the stored prefs, falling back to the defaults (client code only). */
export function getNotifyPrefs(): NotifyPrefs {
  try {
    const raw = localStorage.getItem(NOTIFY_PREFS_KEY);
    return raw ? { ...DEFAULT_NOTIFY_PREFS, ...(JSON.parse(raw) as Partial<NotifyPrefs>) } : { ...DEFAULT_NOTIFY_PREFS };
  } catch {
    return { ...DEFAULT_NOTIFY_PREFS };
  }
}

/** Persists the prefs and notifies subscribers. */
export function setNotifyPrefs(prefs: NotifyPrefs) {
  try {
    localStorage.setItem(NOTIFY_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable */
  }
  notifyLocalStore();
}

// Cache so useSyncExternalStore sees a stable snapshot per stored value.
let notifyPrefsCache: { raw: string; value: NotifyPrefs } | null = null;

/** Live notification prefs (defaults until the first write, defaults during SSR). */
export function useNotifyPrefs(): NotifyPrefs {
  return useSyncExternalStore(
    subscribe,
    () => {
      try {
        const raw = localStorage.getItem(NOTIFY_PREFS_KEY);
        if (!raw) return DEFAULT_NOTIFY_PREFS;
        if (!notifyPrefsCache || notifyPrefsCache.raw !== raw) {
          notifyPrefsCache = { raw, value: { ...DEFAULT_NOTIFY_PREFS, ...(JSON.parse(raw) as Partial<NotifyPrefs>) } };
        }
        return notifyPrefsCache.value;
      } catch {
        return DEFAULT_NOTIFY_PREFS;
      }
    },
    () => DEFAULT_NOTIFY_PREFS,
  );
}

/* ------------------------------------------------------------------ */
/* Theme: mode (light/dark/system) + color palette                     */
/* ------------------------------------------------------------------ */

const THEME_MODE_KEY = "pc-theme";
const THEME_PALETTE_KEY = "pc-palette";
const THEME_EVENT = "pc-theme-change";

export type ThemeMode = "light" | "dark" | "system";
export type ThemeSnapshot = { mode: ThemeMode; palette: string; isDark: boolean };

const DEFAULT_THEME: ThemeSnapshot = { mode: "system", palette: "lavender", isDark: false };

let themeCache: { key: string; value: ThemeSnapshot } | null = null;

function readTheme(): ThemeSnapshot {
  const key = `${localStorage.getItem(THEME_MODE_KEY) ?? ""}|${localStorage.getItem(THEME_PALETTE_KEY) ?? ""}|${document.documentElement.classList.contains("dark")}`;
  if (themeCache && themeCache.key === key) return themeCache.value;
  let mode: ThemeMode = "system";
  let palette = "lavender";
  try {
    const saved = localStorage.getItem(THEME_MODE_KEY);
    if (saved === "dark" || saved === "light") mode = saved;
    palette = localStorage.getItem(THEME_PALETTE_KEY) || "lavender";
  } catch {
    /* private mode */
  }
  themeCache = {
    key,
    value: { mode, palette, isDark: document.documentElement.classList.contains("dark") },
  };
  return themeCache.value;
}

function subscribeTheme(cb: () => void) {
  const onChange = () => cb();
  // other tabs change localStorage; the moon/sun toggle flips the `dark` class
  window.addEventListener("storage", onChange);
  window.addEventListener(THEME_EVENT, onChange);
  const obs = new MutationObserver(onChange);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-palette"] });
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(THEME_EVENT, onChange);
    obs.disconnect();
  };
}

/** SSR-safe live theme snapshot for the appearance card. */
export function useThemeSnapshot(): ThemeSnapshot {
  return useSyncExternalStore(subscribeTheme, readTheme, () => DEFAULT_THEME);
}

/**
 * Theme choices are mirrored to cookies: the server layout renders the
 * `dark` class and `data-palette` straight from them, so the theme survives
 * reloads even where localStorage is evicted or blocked (in-app browsers,
 * private modes, iOS storage eviction). JS-readable cookies only.
 */
function setThemeCookie(key: string, value: string | null) {
  try {
    document.cookie = value
      ? `${key}=${value}; path=/; max-age=31536000; samesite=lax`
      : `${key}=; path=/; max-age=0`;
  } catch {
    /* cookie writes can fail in locked-down contexts */
  }
}

export function readThemeCookie(key: string): string | null {
  try {
    const m = document.cookie.match(new RegExp(`(?:^|; )${key}=([^;]*)`));
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

/** Applies the mode to <html> + localStorage + cookie and notifies. */
export function applyThemeMode(next: ThemeMode) {
  const root = document.documentElement;
  const dark = next === "dark" || (next === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  try {
    if (next === "system") localStorage.removeItem(THEME_MODE_KEY);
    else localStorage.setItem(THEME_MODE_KEY, next);
  } catch {
    /* private mode */
  }
  setThemeCookie(THEME_MODE_KEY, next === "system" ? null : next);
  window.dispatchEvent(new Event(THEME_EVENT));
}

/** Applies a color palette (globals.css data-palette blocks) and notifies. */
export function applyThemePalette(id: string) {
  const root = document.documentElement;
  if (id === "lavender") root.removeAttribute("data-palette");
  else root.setAttribute("data-palette", id);
  try {
    localStorage.setItem(THEME_PALETTE_KEY, id);
  } catch {
    /* private mode */
  }
  setThemeCookie(THEME_PALETTE_KEY, id === "lavender" ? null : id);
  window.dispatchEvent(new Event(THEME_EVENT));
}

/**
 * Re-asserts the stored theme on the <html> element. Runs once after
 * hydration from the root layout — heals environments where the pre-paint
 * DOM state is lost (hydration stripping, delayed scripts). Read-only:
 * never writes storage. Falls back to the cookie when localStorage is empty.
 */
export function reassertStoredTheme() {
  let saved: string | null = null;
  let pal: string | null = null;
  try {
    saved = localStorage.getItem(THEME_MODE_KEY);
    pal = localStorage.getItem(THEME_PALETTE_KEY);
  } catch {
    /* private mode */
  }
  if (!saved) saved = readThemeCookie(THEME_MODE_KEY);
  if (!pal) pal = readThemeCookie(THEME_PALETTE_KEY);

  const dark = saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";
  if (pal && pal !== "lavender") root.setAttribute("data-palette", pal);
  else root.removeAttribute("data-palette");
}
