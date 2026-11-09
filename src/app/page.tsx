import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Bot,
  Check,
  Cookie,
  KeyRound,
  Layers,
  Link2,
  Lock,
  LockKeyhole,
  Megaphone,
  Reply,
  SendHorizontal,
  Send,
  Server,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Trash2,
  UserX,
} from "lucide-react";
import { Avatar, Logo, PandaMark } from "@/components/brand";
import { LangToggle, ThemeToggle } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth";
import type { Dict, Lang } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n-server";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function LandingPage() {
  const [{ t, lang }, user, settings] = await Promise.all([getI18n(), getCurrentUser(), getSettings()]);
  const L = t.landing;
  const nav: Array<[string, string]> = [
    ["#features", L.navFeatures],
    ["#how", L.navHow],
    ["#telegram", L.navTelegram],
    ["#security", L.navSecurity],
  ];
  const features: Array<{ icon: LucideIcon; title: string; desc: string; tone: string }> = [
    { icon: Link2, title: L.f1t, desc: L.f1d, tone: "bg-accent-soft text-accent-ink" },
    { icon: LockKeyhole, title: L.f2t, desc: L.f2d, tone: "bg-lavender-soft text-accent-ink" },
    { icon: Bot, title: L.f3t, desc: L.f3d, tone: "bg-sky-soft text-sky-ink" },
    { icon: Smartphone, title: L.f4t, desc: L.f4d, tone: "bg-mint-soft text-mint-ink" },
    { icon: Layers, title: L.f5t, desc: L.f5d, tone: "bg-amber-soft text-amber-ink" },
    { icon: ShieldCheck, title: L.f6t, desc: L.f6d, tone: "bg-rose-soft text-rose-ink" },
  ];
  const primaryHref = user ? "/dashboard" : "/register";
  const primaryLabel = user ? t.common.openDashboard : L.ctaPrimary;

  return (
    <div className="min-h-dvh">
      {settings.announcement ? (
        <div className="border-b border-line bg-accent-soft px-5 py-2.5 text-center text-sm font-semibold text-accent-ink">
          <Megaphone className="me-2 inline size-4 align-[-3px]" />
          {settings.announcement}
        </div>
      ) : null}

      {/* Navigation */}
      <header className="glass sticky top-0 z-40 border-b border-line/70">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
          <Logo />
          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
            {nav.map(([href, label]) => (
              <a key={href} href={href} className="rounded-lg px-3 py-2 text-sm font-semibold text-ink-2 transition hover:bg-surface-3 hover:text-ink">
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-0.5">
            <LangToggle compact className="sm:hidden" />
            <LangToggle className="hidden sm:inline-flex" />
            <ThemeToggle />
            {user ? (
              <Link href="/dashboard" className="btn btn-primary ms-1.5">
                {t.common.openDashboard}
              </Link>
            ) : (
              <>
                <Link href="/login" className="btn btn-ghost hidden sm:inline-flex">
                  {t.common.login}
                </Link>
                <Link href="/register" className="btn btn-primary ms-1.5">
                  {t.common.signup}
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="hero-glow pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="grid-fade pointer-events-none absolute inset-0 opacity-70" aria-hidden="true" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-16 px-5 pb-24 pt-14 sm:pt-20 lg:grid-cols-[1.02fr_1fr] lg:gap-10 lg:pb-32">
          <div className="fade-up">
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/80 px-3 py-1.5 text-xs font-bold text-ink-2 shadow-soft">
              <span className="live-dot" aria-hidden="true" />
              {L.badge}
            </span>
            <h1
              className={`mt-6 text-[2.45rem] font-extrabold text-ink sm:text-5xl lg:text-[3.55rem] ${
                lang === "fa" ? "leading-[1.4]" : "leading-[1.07]"
              }`}
            >
              {L.titleA} <span className="gradient-text">{L.titleHighlight}</span> {L.titleB}
            </h1>
            <p className="mt-6 max-w-xl text-[1.075rem] leading-relaxed text-muted sm:text-lg">{L.subtitle}</p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href={primaryHref} className="btn btn-primary btn-lg">
                {primaryLabel}
                <ArrowRight className="size-4 rtl:rotate-180" />
              </Link>
              {!user ? (
                <Link href="/login" className="btn btn-secondary btn-lg">
                  {L.ctaSecondary}
                </Link>
              ) : null}
            </div>
            <ul className="mt-9 flex flex-wrap gap-x-6 gap-y-2.5 text-sm font-semibold text-ink-2">
              {[L.perk1, L.perk2, L.perk3].map((perk) => (
                <li key={perk} className="flex items-center gap-2">
                  <span className="grid size-5 place-items-center rounded-full bg-mint-soft text-mint-ink">
                    <Check className="size-3" strokeWidth={3} />
                  </span>
                  {perk}
                </li>
              ))}
            </ul>
          </div>
          <HeroPreview t={t} />
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-20 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-5">
          <SectionHeading lang={lang} kicker={L.featuresKicker} title={L.featuresTitle} subtitle={L.featuresSubtitle} />
          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <article key={f.title} className="card p-6 transition duration-300 hover:-translate-y-0.5 hover:shadow-card sm:p-7">
                <span className={`icon-tile ${f.tone}`}>
                  <f.icon className="size-5" />
                </span>
                <h3 className="mt-5 text-lg font-extrabold text-ink">{f.title}</h3>
                <p className="mt-2 text-[0.95rem] leading-relaxed text-muted">{f.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-20 border-y border-line bg-surface/60 py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-5">
          <SectionHeading lang={lang} kicker={L.howKicker} title={L.howTitle} subtitle={L.howSubtitle} />
          <ol className="relative mt-16 grid gap-10 md:grid-cols-3 md:gap-6">
            <div className="absolute inset-x-[16%] top-7 hidden border-t-2 border-dashed border-line-strong md:block" aria-hidden="true" />
            {[
              [L.s1t, L.s1d],
              [L.s2t, L.s2d],
              [L.s3t, L.s3d],
            ].map(([title, desc], i) => (
              <li key={title} className="relative text-center">
                <span className="relative mx-auto grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-accent to-accent-2 text-xl font-extrabold text-[var(--on-accent)] shadow-card ring-8 ring-canvas">
                  {(i + 1).toLocaleString(lang === "fa" ? "fa-IR" : "en-US")}
                </span>
                <h3 className="mt-6 text-lg font-extrabold text-ink">{title}</h3>
                <p className="mx-auto mt-2 max-w-xs text-[0.95rem] leading-relaxed text-muted">{desc}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Telegram */}
      <section id="telegram" className="scroll-mt-20 py-20 sm:py-28">
        <div className="mx-auto grid max-w-6xl items-center gap-16 px-5 lg:grid-cols-2">
          <div>
            <SectionHeading lang={lang} kicker={L.tgKicker} title={L.tgTitle} subtitle={L.tgSubtitle} center={false} />
            <ul className="mt-8 space-y-3.5">
              {(
                [
                  [Reply, L.tgPoint1],
                  [Trash2, L.tgPoint2],
                  [KeyRound, L.tgPoint3],
                ] as Array<[LucideIcon, string]>
              ).map(([Icon, text]) => (
                <li key={text} className="flex items-center gap-3 text-[0.95rem] font-semibold text-ink-2">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sky-soft text-sky-ink">
                    <Icon className="size-4" />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
            <p className="mt-9 text-xs font-extrabold uppercase tracking-[0.14em] text-muted">{L.tgCommandsTitle}</p>
            <div className="mt-3 flex flex-wrap gap-2" dir="ltr">
              {["/status", "/link", "/newlink", "/lock", "/kick", "/password", "/recent", "/mute"].map((c) => (
                <code key={c} className="rounded-lg border border-line bg-surface px-2.5 py-1 font-mono text-xs font-bold text-accent-ink shadow-soft">
                  {c}
                </code>
              ))}
            </div>
          </div>
          <TelegramPreview t={t} />
        </div>
      </section>

      {/* Security */}
      <section id="security" className="scroll-mt-20 pb-20 sm:pb-28">
        <div className="mx-auto max-w-6xl px-5">
          <div className="rounded-[1.75rem] border border-line bg-gradient-to-br from-surface via-surface to-lavender-soft p-8 shadow-soft sm:p-12">
            <SectionHeading lang={lang} kicker={L.secKicker} title={L.secTitle} subtitle={L.secSubtitle} center={false} />
            <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {(
                [
                  [Server, L.sec1t, L.sec1d],
                  [KeyRound, L.sec2t, L.sec2d],
                  [Cookie, L.sec3t, L.sec3d],
                  [Lock, L.sec4t, L.sec4d],
                ] as Array<[LucideIcon, string, string]>
              ).map(([Icon, title, desc]) => (
                <div key={title}>
                  <span className="icon-tile bg-surface text-accent-ink shadow-soft">
                    <Icon className="size-5" />
                  </span>
                  <h3 className="mt-4 font-extrabold text-ink">{title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="pb-24">
        <div className="mx-auto max-w-6xl px-5">
          <div className="relative overflow-hidden rounded-[1.75rem] border border-line bg-gradient-to-br from-accent-soft via-lavender-soft to-sky-soft px-6 py-16 text-center sm:px-16">
            <div className="pointer-events-none absolute -start-16 -top-20 size-72 rounded-full bg-lavender/70 blur-3xl" aria-hidden="true" />
            <div className="pointer-events-none absolute -bottom-24 -end-10 size-72 rounded-full bg-sky/70 blur-3xl" aria-hidden="true" />
            <div className="relative">
              <PandaMark size={60} className="float-slow mx-auto" />
              <h2 className="mx-auto mt-7 max-w-2xl text-3xl font-extrabold text-ink sm:text-4xl">{L.ctaTitle}</h2>
              <p className="mx-auto mt-4 max-w-lg text-lg text-ink-2">{L.ctaSubtitle}</p>
              <div className="mt-9 flex flex-wrap justify-center gap-3">
                <Link href={primaryHref} className="btn btn-primary btn-lg">
                  {user ? t.common.openDashboard : L.ctaButton}
                  <ArrowRight className="size-4 rtl:rotate-180" />
                </Link>
                {!user ? (
                  <Link href="/login" className="btn btn-secondary btn-lg">
                    {t.common.login}
                  </Link>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-line bg-surface/60">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 sm:grid-cols-[1.6fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-muted">{L.footerTagline}</p>
          </div>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-faint">{L.footerProduct}</p>
            <ul className="mt-4 space-y-2.5 text-sm font-semibold">
              {nav.map(([href, label]) => (
                <li key={href}>
                  <a href={href} className="text-ink-2 transition hover:text-accent-ink">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-faint">{L.footerAccount}</p>
            <ul className="mt-4 space-y-2.5 text-sm font-semibold">
              {user ? (
                <li>
                  <Link href="/dashboard" className="text-ink-2 transition hover:text-accent-ink">
                    {t.common.dashboard}
                  </Link>
                </li>
              ) : (
                <>
                  <li>
                    <Link href="/login" className="text-ink-2 transition hover:text-accent-ink">
                      {t.common.login}
                    </Link>
                  </li>
                  <li>
                    <Link href="/register" className="text-ink-2 transition hover:text-accent-ink">
                      {t.common.signup}
                    </Link>
                  </li>
                </>
              )}
            </ul>
          </div>
        </div>
        <div className="border-t border-line">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-6 text-xs text-faint sm:flex-row">
            <p>
              © 2026 Panda Chat. {L.footerRights}
            </p>
            <div className="flex items-center gap-0.5">
              <LangToggle compact />
              <ThemeToggle />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

function SectionHeading({
  kicker,
  title,
  subtitle,
  center = true,
  lang,
}: {
  kicker: string;
  title: string;
  subtitle: string;
  center?: boolean;
  lang: Lang;
}) {
  return (
    <div className={center ? "mx-auto max-w-2xl text-center" : "max-w-xl"}>
      <p className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.16em] text-accent-ink">
        <Sparkles className="size-3.5" />
        {kicker}
      </p>
      <h2 className={`mt-4 text-3xl font-extrabold text-ink sm:text-[2.55rem] ${lang === "fa" ? "sm:leading-[1.45]" : "sm:leading-[1.14]"}`}>{title}</h2>
      <p className="mt-4 text-lg leading-relaxed text-muted">{subtitle}</p>
    </div>
  );
}

function HeroPreview({ t }: { t: Dict }) {
  const L = t.landing;
  return (
    <div className="fade-up relative mx-auto w-full max-w-[540px] [animation-delay:140ms]">
      <div className="absolute -inset-8 -z-10 rounded-[2.5rem] bg-gradient-to-br from-lavender/70 via-accent-soft to-sky/60 blur-2xl" aria-hidden="true" />
      <div className="overflow-hidden rounded-[1.4rem] border border-line bg-surface shadow-float">
        <div className="flex items-center gap-3 border-b border-line bg-surface-2 px-4 py-3">
          <div className="flex gap-1.5" aria-hidden="true">
            <span className="size-2.5 rounded-full bg-[#f5b5c2]" />
            <span className="size-2.5 rounded-full bg-[#f7d99c]" />
            <span className="size-2.5 rounded-full bg-[#b4e3cc]" />
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5 text-[11px] text-muted" dir="ltr">
            <Lock className="size-3 shrink-0 text-mint-ink" />
            <span className="truncate">
              pandachat.app/r/<span className="text-ink-2">x7Gk2pQ9vL4mTz8sWb1nRc6yHd3fJa5eK0uViOq2Ls</span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <Avatar name={L.previewRoom} size={38} square />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-extrabold text-ink">{L.previewRoom}</p>
            <p className="flex items-center gap-1.5 text-[11px] text-muted">
              {L.previewMembers} · <span className="size-1.5 rounded-full bg-[#4cc79a]" /> {L.previewOnline}
            </p>
          </div>
          <span className="badge badge-accent">
            <KeyRound className="size-3" />
            {t.chat.protected}
          </span>
        </div>
        <div className="chat-surface space-y-3 px-4 py-5">
          <div className="flex items-end gap-2">
            <Avatar name={L.previewMsg1Author} size={28} />
            <div className="max-w-[78%]">
              <p className="mb-1 px-1 text-[11px] font-bold text-ink-2">{L.previewMsg1Author}</p>
              <div className="bubble bubble-in text-[13px]">
                {L.previewMsg1}
                <span className="ms-2 text-[10px] text-faint">10:24</span>
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <div className="bubble bubble-out max-w-[80%] text-[13px]">
              {L.previewMsg2}
              <span className="ms-2 text-[10px] opacity-60">10:25</span>
            </div>
          </div>
          <div className="flex items-end gap-2">
            <Avatar name={L.previewMsg3Author} size={28} />
            <div className="max-w-[78%]">
              <p className="mb-1 px-1 text-[11px] font-bold text-ink-2">{L.previewMsg3Author}</p>
              <div className="bubble bubble-in text-[13px]">
                {L.previewMsg3}
                <span className="ms-2 text-[10px] text-faint">10:26</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 border-t border-line px-3 py-3">
          <div className="flex h-10 flex-1 items-center rounded-xl border border-line-strong bg-surface px-3.5 text-sm text-faint">{L.previewComposer}</div>
          <span className="btn btn-primary btn-icon rounded-xl" aria-hidden="true">
            <SendHorizontal className="size-4 rtl:-scale-x-100" />
          </span>
        </div>
      </div>

      <div className="float-slow absolute -bottom-16 -start-6 hidden w-[260px] rounded-2xl border border-line bg-surface/95 p-3 shadow-float backdrop-blur sm:block">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-sky-soft text-sky-ink">
            <Send className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-extrabold text-ink">{L.previewBot}</p>
            <p className="truncate text-[11px] text-muted">{L.previewBotText}</p>
          </div>
        </div>
      </div>
      <div className="float-slow absolute -end-4 -top-7 hidden rounded-2xl border border-line bg-surface/95 px-3.5 py-2.5 shadow-float backdrop-blur [animation-delay:1.6s] sm:block">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-lavender-soft text-accent-ink">
            <LockKeyhole className="size-4" />
          </span>
          <div>
            <p className="text-xs font-extrabold text-ink">{L.previewGate}</p>
            <p className="flex items-center gap-1 text-[11px] font-semibold text-mint-ink">
              <ShieldCheck className="size-3" />
              {L.previewGateSub}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function TelegramPreview({ t }: { t: Dict }) {
  const L = t.landing;
  return (
    <div className="relative mx-auto w-full max-w-[420px]">
      <div className="absolute -inset-8 -z-10 rounded-[2.5rem] bg-gradient-to-tr from-sky/60 via-accent-soft to-lavender/60 blur-2xl" aria-hidden="true" />
      <div className="overflow-hidden rounded-[1.6rem] border border-line bg-surface shadow-float">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <PandaMark size={38} />
          <div>
            <p className="text-sm font-extrabold text-ink">{L.tgChatTitle}</p>
            <p className="text-[11px] text-muted">{L.tgChatSubtitle}</p>
          </div>
        </div>
        <div className="space-y-3 bg-gradient-to-b from-sky-soft/70 to-surface px-4 py-5">
          <div className="max-w-[88%]">
            <div className="rounded-2xl rounded-es-md border border-line bg-surface px-3.5 py-2.5 text-[13px] shadow-soft">
              <p className="font-extrabold text-ink" dir="auto">💬 {L.tgChatIncoming}</p>
              <p className="mt-1.5 text-ink-2" dir="auto">{L.tgChatIncomingText}</p>
            </div>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-[11px] font-bold text-ink-2" dir="ltr">
              <span className="flex items-center justify-center gap-1 rounded-lg bg-surface/80 py-1.5 shadow-soft">
                <Trash2 className="size-3" /> Delete
              </span>
              <span className="flex items-center justify-center gap-1 rounded-lg bg-surface/80 py-1.5 shadow-soft">
                <UserX className="size-3" /> Remove sender
              </span>
            </div>
          </div>
          <div className="flex justify-end">
            <div className="max-w-[80%] rounded-2xl rounded-ee-md bg-gradient-to-br from-[#d9efff] to-[#e6e2ff] px-3.5 py-2.5 text-[13px] text-[#263043] dark:from-[#26405a] dark:to-[#363262] dark:text-[#eef0ff]">
              <span className="mb-1 block border-s-2 border-sky-ink ps-2 text-[11px] opacity-75" dir="auto">
                {L.tgChatIncomingText}
              </span>
              <span dir="auto">{L.tgChatReply}</span>
            </div>
          </div>
          <div className="flex justify-end" dir="ltr">
            <span className="rounded-2xl rounded-ee-md bg-gradient-to-br from-[#d9efff] to-[#e6e2ff] px-3.5 py-2 font-mono text-[13px] font-bold text-[#3a56b8] dark:from-[#26405a] dark:to-[#363262] dark:text-[#aeb8ff]">
              /lock
            </span>
          </div>
          <div className="max-w-[88%] rounded-2xl rounded-es-md border border-line bg-surface px-3.5 py-2.5 text-[13px] text-ink-2 shadow-soft" dir="ltr">
            🔒 Room locked. Members can read, only you can send messages.
          </div>
        </div>
      </div>
    </div>
  );
}
