"use client";

import { useState, useSyncExternalStore } from "react";
import { Bell, CircleDot, Eye, Volume2 } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";
import { setNotifyPrefs, useNotifyPrefs, type NotifyPrefs } from "@/lib/local-store";
import { cn } from "@/lib/utils";

/**
 * Notification.permission has no change event, so the "subscription" is a
 * no-op — React simply re-reads the snapshot on every render.
 */
const subscribePermission = () => () => {};
const getPermission = (): NotificationPermission =>
  typeof Notification !== "undefined" ? Notification.permission : "default";
const getServerPermission = (): NotificationPermission => "default";

/**
 * Device-local browser-notification preferences (stored in localStorage).
 * The master switch asks the browser for permission the first time it is
 * turned on; sound/badge/preview only make sense while the master is on.
 * Notification.permission is read through a guarded snapshot ("default" on
 * the server) and every other Notification access happens inside handlers
 * so the card renders safely on the server too.
 */
export function NotificationsCard() {
  const { t } = useI18n();
  const prefs = useNotifyPrefs();
  // True when the browser refuses to show notifications (permission denied,
  // or the user dismissed the prompt). Purely client-side knowledge.
  const [dismissed, setDismissed] = useState(false);
  const permission = useSyncExternalStore(subscribePermission, getPermission, getServerPermission);
  const blocked = permission === "denied" || dismissed;

  const save = (patch: Partial<NotifyPrefs>) => setNotifyPrefs({ ...prefs, ...patch });

  const toggleMaster = async () => {
    const next = !prefs.enabled;
    if (next && typeof Notification !== "undefined" && Notification.permission === "default") {
      const result = await Notification.requestPermission();
      setDismissed(result !== "granted");
    }
    // Keep enabled=true even when permission was refused — the user may
    // still want the sound / badge / preview behaviours.
    save({ enabled: next });
  };

  /** Fires a sample system notification plus the soft WebAudio ding. */
  const sendTest = () => {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        new Notification("Panda Chat", { body: t.notify.testBody, silent: true });
      } catch {
        /* some browsers require a service worker — the ding still plays */
      }
    }
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.12;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.09);
      setTimeout(() => void ctx.close(), 300);
    } catch {
      /* autoplay policy or missing WebAudio — nothing to do */
    }
  };

  const rows: Array<{
    key: keyof Omit<NotifyPrefs, "enabled"> | "enabled";
    label: string;
    hint: string;
    icon: typeof Bell;
    on: boolean;
    disabled: boolean;
    toggle: () => void;
  }> = [
    {
      key: "enabled",
      label: t.notify.master,
      hint: t.notify.masterHint,
      icon: Bell,
      on: prefs.enabled,
      disabled: false,
      toggle: () => void toggleMaster(),
    },
    {
      key: "sound",
      label: t.notify.sound,
      hint: t.notify.soundHint,
      icon: Volume2,
      on: prefs.sound,
      disabled: !prefs.enabled,
      toggle: () => save({ sound: !prefs.sound }),
    },
    {
      key: "badge",
      label: t.notify.badge,
      hint: t.notify.badgeHint,
      icon: CircleDot,
      on: prefs.badge,
      disabled: !prefs.enabled,
      toggle: () => save({ badge: !prefs.badge }),
    },
    {
      key: "preview",
      label: t.notify.preview,
      hint: t.notify.previewHint,
      icon: Eye,
      on: prefs.preview,
      disabled: !prefs.enabled,
      toggle: () => save({ preview: !prefs.preview }),
    },
  ];

  return (
    <section className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-center gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-white shadow-soft">
          <Bell className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-extrabold text-ink">{t.notify.title}</h2>
          <p className="mt-1 text-sm text-muted">{t.notify.subtitle}</p>
        </div>
        <button type="button" className="btn btn-soft btn-sm" onClick={sendTest}>
          {t.notify.test}
        </button>
      </div>

      <div className="mt-5 space-y-4">
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <div key={row.key} className="rounded-2xl border border-line bg-surface-2/50 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-1.5 text-sm font-bold text-ink">
                    <Icon className="size-4 text-accent-ink" />
                    {row.label}
                  </p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted">{row.hint}</p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={row.on}
                  aria-label={row.label}
                  disabled={row.disabled}
                  className={cn(
                    "relative block h-[1.45rem] w-10 shrink-0 rounded-full transition",
                    row.on ? "bg-gradient-to-r from-accent to-accent-2" : "bg-line-strong",
                    row.disabled && "opacity-40",
                  )}
                  onClick={row.toggle}
                >
                  <span
                    className={cn(
                      "absolute top-[3px] size-[calc(1.45rem-6px)] rounded-full bg-white shadow transition-all",
                      row.on ? "start-[calc(100%-1.45rem+3px)]" : "start-[3px]",
                    )}
                  />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {blocked ? <p className="notice notice-amber mt-4">{t.notify.blocked}</p> : null}

      <p className="mt-4 border-t border-line pt-4 text-xs text-faint">{t.notify.localOnly}</p>
    </section>
  );
}
