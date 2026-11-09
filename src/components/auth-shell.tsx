import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { KeyRound, Link2, Send } from "lucide-react";
import { Avatar, Logo, PandaMark } from "./brand";
import { LangToggle, ThemeToggle } from "./ui";
import { getI18n } from "@/lib/i18n-server";

export async function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const { t } = await getI18n();
  const points: Array<[LucideIcon, string]> = [
    [Link2, t.auth.asidePoint1],
    [KeyRound, t.auth.asidePoint2],
    [Send, t.auth.asidePoint3],
  ];
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className="relative flex min-h-dvh flex-col overflow-hidden px-5 py-5 sm:px-10">
        <div className="hero-glow pointer-events-none absolute inset-0 opacity-60 lg:hidden" aria-hidden="true" />
        <header className="relative flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-0.5">
            <LangToggle compact />
            <ThemeToggle />
          </div>
        </header>
        <div className="relative flex flex-1 items-center justify-center py-10">
          <div className="fade-up w-full max-w-[410px]">
            <h1 className="text-[1.85rem] font-extrabold text-ink">{title}</h1>
            <p className="mt-2 text-muted">{subtitle}</p>
            <div className="mt-8">{children}</div>
          </div>
        </div>
        <p className="relative text-center text-xs text-faint lg:text-start">© 2026 Panda Chat</p>
      </section>

      <aside className="hidden p-4 lg:block">
        <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-[1.75rem] border border-line bg-gradient-to-br from-accent-soft via-lavender-soft to-sky-soft p-12">
          <div className="pointer-events-none absolute -end-24 -top-24 size-80 rounded-full bg-lavender/60 blur-3xl" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-28 -start-20 size-80 rounded-full bg-sky/60 blur-3xl" aria-hidden="true" />
          <div className="relative">
            <PandaMark size={54} className="float-slow" />
            <h2 className="mt-8 max-w-md text-[2.1rem] font-extrabold text-ink">{t.auth.asideTitle}</h2>
            <p className="mt-4 max-w-md text-[1.02rem] leading-relaxed text-ink-2">{t.auth.asideText}</p>
            <ul className="mt-9 space-y-3.5">
              {points.map(([Icon, text]) => (
                <li key={text} className="flex items-center gap-3 text-sm font-semibold text-ink-2">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface/85 text-accent-ink shadow-soft">
                    <Icon className="size-4" />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </div>
          <div className="relative mt-12 max-w-md space-y-3" aria-hidden="true">
            <div className="flex items-end gap-2">
              <Avatar name={t.landing.previewMsg1Author} size={30} />
              <div className="bubble bubble-in max-w-[78%] text-[13px]">{t.landing.previewMsg1}</div>
            </div>
            <div className="flex justify-end">
              <div className="bubble bubble-out max-w-[78%] text-[13px]">{t.landing.previewMsg2}</div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
