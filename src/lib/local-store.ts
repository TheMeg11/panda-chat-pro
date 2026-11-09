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

/** Live JSON value; null when absent or during SSR. */
export function useLocalJson<T>(key: string): T | null {
  return useSyncExternalStore(
    subscribe,
    () => {
      try {
        const raw = localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : null;
      } catch {
        return null;
      }
    },
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
