"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, Smartphone, SquareCheckBig } from "lucide-react";
import { useI18n } from "@/components/i18n-provider";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** Registers the static-asset service worker (PWA offline shell). Renders nothing. */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (location.protocol !== "https:" && location.hostname !== "localhost") return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);
  return null;
}

function standaloneQuery() {
  return window.matchMedia("(display-mode: standalone)");
}

function subscribeStandalone(callback: () => void) {
  const q = standaloneQuery();
  q.addEventListener("change", callback);
  return () => q.removeEventListener("change", callback);
}

function standaloneSnapshot(): boolean {
  // iOS Safari exposes navigator.standalone instead of the display-mode media query.
  return standaloneQuery().matches || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
}

/** Settings card: installs the app to the home screen when the browser allows it. */
export function InstallAppCard() {
  const { t } = useI18n();
  const standalone = useSyncExternalStore(subscribeStandalone, standaloneSnapshot, () => false);
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPromptEvent(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      setPromptEvent(null);
      setInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (!promptEvent) return;
    await promptEvent.prompt();
    const choice = await promptEvent.userChoice;
    if (choice.outcome === "accepted") setInstalled(true);
    setPromptEvent(null);
  };

  return (
    <section className="card p-5 sm:p-6">
      <h2 className="flex items-center gap-2 font-extrabold text-ink">
        <Smartphone className="size-4 text-accent-ink" />
        {t.app.title}
      </h2>
      <p className="mt-1 text-sm text-muted">{t.app.installText}</p>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {standalone || installed ? (
          <span className="notice notice-mint !mt-0">
            <SquareCheckBig className="size-4 shrink-0" />
            {installed ? t.app.installed : t.app.installDone}
          </span>
        ) : promptEvent ? (
          <button type="button" onClick={install} className="btn btn-primary">
            <Download className="size-4" />
            {t.app.install}
          </button>
        ) : (
          <p className="text-xs font-semibold text-muted">{t.app.iosHint}</p>
        )}
      </div>
    </section>
  );
}
