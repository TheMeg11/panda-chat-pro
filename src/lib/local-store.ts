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
