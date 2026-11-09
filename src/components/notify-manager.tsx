"use client";

import { useEffect, useRef } from "react";
import { useI18n } from "@/components/i18n-provider";
import { getNotifyPrefs, type NotifyPrefs } from "@/lib/local-store";
import type { DashboardChat } from "@/lib/rooms";

const POLL_MS = 20_000;
/** While the tab is hidden the poll runs only every 3rd tick (~60s). */
const HIDDEN_EVERY = 3;

type ChatListResponse = { chats?: DashboardChat[] };

/**
 * Dashboard notification runtime — no props, renders nothing.
 *
 * Every 20s it re-reads the device-local prefs and polls /api/chats (only when
 * the master switch or the favicon badge is on). When a conversation flips from
 * read → unread it fires a system notification (with a preview snippet when
 * allowed) and/or the WebAudio chime, and keeps a red dot + counter on the
 * favicon & tab title. Everything lives inside the effect, so SSR is a no-op.
 */
export function NotifyManager() {
  const { t } = useI18n();
  /** chatId → was-unread on the previous successful poll */
  const prevUnreadRef = useRef<Map<string, boolean>>(new Map());
  const initializedRef = useRef(false);
  /** icon <link> hrefs captured once, before the first overwrite */
  const originalIconsRef = useRef<Array<{ el: HTMLLinkElement; href: string }> | null>(null);
  const originalTitleRef = useRef<string | null>(null);
  const lastBadgeRef = useRef(-1);
  /** rendered badge data URLs per unread count (canvas work is not free) */
  const badgeCacheRef = useRef<Map<number, string>>(new Map());

  useEffect(() => {
    let stopped = false;
    let tick = 0;

    /* ---- WebAudio chime (two short sine blips) ---- */
    const ding = () => {
      try {
        const c = new AudioContext();
        const g = c.createGain();
        g.gain.value = 0.12;
        g.connect(c.destination);
        [880, 1320].forEach((f, i) => {
          const o = c.createOscillator();
          o.frequency.value = f;
          o.connect(g);
          o.start(c.currentTime + i * 0.09);
          o.stop(c.currentTime + i * 0.09 + 0.08);
        });
        setTimeout(() => void c.close().catch(() => {}), 400);
      } catch {
        /* audio unavailable — silent fallback */
      }
    };

    /* ---- favicon badge ---- */
    const iconLinks = (): HTMLLinkElement[] =>
      Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'));

    const captureOriginals = () => {
      if (originalIconsRef.current === null) {
        originalIconsRef.current = iconLinks().map((el) => ({ el, href: el.href }));
      }
      if (originalTitleRef.current === null) {
        originalTitleRef.current = document.title;
      }
    };

    const restoreIcons = () => {
      for (const { el, href } of originalIconsRef.current ?? []) el.href = href;
      if (originalTitleRef.current !== null) document.title = originalTitleRef.current;
      lastBadgeRef.current = -1;
    };

    const applyBadge = async (count: number) => {
      try {
        if (count === lastBadgeRef.current) return;
        captureOriginals();
        if (count <= 0) {
          restoreIcons();
          return;
        }
        let dataUrl = badgeCacheRef.current.get(count);
        if (!dataUrl) {
          const img = new Image();
          img.src = "/icons/icon-32.png";
          await img.decode();
          const canvas = document.createElement("canvas");
          canvas.width = 32;
          canvas.height = 32;
          const ctx = canvas.getContext("2d");
          if (!ctx) return;
          ctx.drawImage(img, 0, 0, 32, 32);
          ctx.fillStyle = "#e11d48";
          ctx.beginPath();
          ctx.arc(25, 7, 7, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 1.5;
          ctx.stroke();
          dataUrl = canvas.toDataURL("image/png");
          badgeCacheRef.current.set(count, dataUrl);
        }
        for (const { el } of originalIconsRef.current ?? []) el.href = dataUrl;
        document.title = `(${count}) ${originalTitleRef.current ?? ""}`;
        lastBadgeRef.current = count;
      } catch {
        /* icon fetch/draw failed — badge is cosmetic, never fatal */
      }
    };

    /* ---- poll ---- */
    const poll = async (prefs: NotifyPrefs) => {
      let chats: DashboardChat[];
      try {
        const res = await fetch("/api/chats", { cache: "no-store" });
        if (!res.ok) return;
        chats = ((await res.json()) as ChatListResponse).chats ?? [];
      } catch {
        return; // offline — retry on the next tick
      }
      if (stopped) return;

      const prev = prevUnreadRef.current;
      if (!initializedRef.current) {
        // First response only seeds the baseline — never notifies.
        initializedRef.current = true;
      } else {
        // The conversation currently open in a visible tab is being read, so
        // it must not notify against itself.
        const openId = document.hidden ? null : (location.pathname.match(/dashboard\/rooms\/([^/]+)/)?.[1] ?? null);
        for (const chat of chats) {
          if (prev.get(chat.id)) continue; // only false → true flips
          if (!chat.hasUnread) continue;
          if (openId !== null && chat.id === openId) continue;
          if (prefs.enabled && typeof Notification !== "undefined" && Notification.permission === "granted") {
            const snippet = prefs.preview ? chat.lastMessage?.body ?? "" : "";
            try {
              // `renotify` re-alerts on repeated notifications with the same tag; it is
              // not in every TS lib.dom revision, hence the widened options object.
              const options = {
                body: prefs.preview && snippet ? snippet.slice(0, 80) : t.notify.newMessageBody,
                tag: `pc-${chat.id}`,
                icon: "/icons/icon-192.png",
                renotify: true,
              } as NotificationOptions;
              const n = new Notification(chat.name, options);
              n.onclick = () => {
                window.focus();
                location.assign(`/dashboard/rooms/${chat.id}`);
              };
            } catch {
              /* constructor can throw on some platforms — ignore */
            }
          }
          if (prefs.sound) ding();
        }
      }
      prev.clear();
      for (const chat of chats) prev.set(chat.id, chat.hasUnread);

      if (prefs.badge) void applyBadge(chats.filter((c) => c.hasUnread).length);
    };

    const timer = window.setInterval(() => {
      if (stopped) return;
      const prefs = getNotifyPrefs();
      tick += 1;
      if (!prefs.enabled && !prefs.badge) return;
      if (document.hidden && tick % HIDDEN_EVERY !== 0) return;
      void poll(prefs);
    }, POLL_MS);

    return () => {
      stopped = true;
      window.clearInterval(timer);
      restoreIcons();
    };
  }, [t]);

  return null;
}
