import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { KeyRound, Link2, Send, ShieldCheck, Zap } from "lucide-react";
import { Avatar, Logo, PandaMark } from "./brand";
import { LangToggle, ThemeToggle } from "./ui";
import { getI18n } from "@/lib/i18n-server";

/**
 * Two-column auth layout from the v2.0 theme: form on the left, deep-navy
 * brand panel (glows + bullets + chat bubbles) on the right (lg+). Phones
 * get a single calm column with a soft glow behind the header.
 */
export async function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  const { t } = await getI18n();
  const points: Array<[LucideIcon, string]> = [
    [ShieldCheck, t.auth.asidePoint1],
    [KeyRound, t.auth.asidePoint2],
    [Zap, t.auth.asidePoint3],
  ];
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* form column */}
      <section className="relative flex min-h-dvh flex-col overflow-hidden px-5 py-5 sm:px-8">
        <div className="hero-glow pointer-events-none absolute inset-x-0 top-0 h-[420px] lg:hidden" aria-hidden="true" />
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

      {/* brand panel (lg+) — always deep navy, like the theme's aside */}
      <aside className="relative hidden overflow-hidden bg-side text-white lg:flex lg:flex-col">
        <div className="pointer-events-none absolute -start-32 top-1/3 size-[520px] rounded-full bg-brand/35 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -end-20 -top-20 size-80 rounded-full bg-[#5b7bff]/25 blur-3xl" aria-hidden="true" />
        <div className="relative p-10">
          <Logo size={42} href={null} onDark />
        </div>
        <div className="relative flex flex-1 flex-col justify-center px-12 pb-12">
          <h2 className="max-w-md text-[44px] font-extrabold leading-[1.1] tracking-tight">{t.auth.asideTitle}</h2>
          <p className="mt-5 max-w-md text-base leading-relaxed text-white/70">{t.auth.asideText}</p>
          <ul className="mt-9 space-y-4">
            {points.map(([Icon, text]) => (
              <li key={text} className="flex items-center gap-3 text-base font-semibold text-white/80">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 text-white">
                  <Icon className="size-[18px]" />
                </span>
                {text}
              </li>
            ))}
          </ul>
          <div className="mt-12 max-w-md space-y-3" aria-hidden="true">
            <div className="flex items-end gap-2">
              <Avatar name={t.landing.previewMsg1Author} size={30} />
              <div className="bubble bubble-in max-w-[78%] border-transparent bg-white/10 text-[13px] text-white shadow-none">
                {t.landing.previewMsg1}
              </div>
            </div>
            <div className="flex justify-end">
              <div className="bubble bubble-out max-w-[78%] border-transparent text-[13px]">{t.landing.previewMsg2}</div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
