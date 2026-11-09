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
