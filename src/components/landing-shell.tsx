"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  ChevronDown,
  EyeOff,
  FileUp,
  Fingerprint,
  Heart,
  KeyRound,
  Languages,
  Lock,
  Menu as MenuIcon,
  Moon,
  Play,
  ShieldCheck,
  Sun,
  Timer,
  Users,
  X,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand";
import { LangToggle, ThemeToggle } from "@/components/ui";
import { Button, ProductPreview } from "@/components/landing-ui";
import { useI18n } from "@/components/i18n-provider";
import type { Dict, Lang } from "@/lib/i18n";

export const LANDING_SECTIONS: Array<[string, "navFeatures" | "navAbout" | "navFaq"]> = [
  ["features", "navFeatures"],
  ["about", "navAbout"],
  ["faq", "navFaq"],
];

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Interactive shell of the theme landing page (header + hero + sections + footer). */
export default function LandingShell({ user, lang }: { user: { name: string } | null; lang: Lang }) {
  const { t } = useI18n();
  const L = t.landing;
  const [open, setOpen] = useState(false);
  const start = () => (window.location.href = user ? "/dashboard" : "/register");

  return (
    <div className="relative isolate min-h-full overflow-x-clip bg-canvas text-ink">
      {/* soft lavender glow behind header + hero, fading out smoothly */}
      <div
        className="hero-glow pointer-events-none absolute inset-x-0 top-0 -z-10 h-[980px] [mask-image:linear-gradient(to_bottom,#000_55%,transparent)]"
        aria-hidden="true"
      />
      {/* ───────── Header ───────── */}
      <header className="sticky top-0 z-40 border-b border-transparent bg-canvas/80 backdrop-blur-xl">
        <div className="mx-auto flex h-[68px] max-w-7xl items-center gap-3 px-5 pt-safe sm:h-[76px] sm:px-8">
          <Link href="/" aria-label="Panda Chat Pro" className="me-auto rounded-full">
            <Logo size={38} href={null} />
          </Link>
          <nav className="hidden items-center gap-9 md:flex" aria-label="Primary">
            {LANDING_SECTIONS.map(([id, key]) => (
              <button key={id} onClick={() => scrollToId(id)} className="text-sm font-semibold text-ink-2 transition hover:text-accent-ink">
                {L[key]}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-1.5 sm:gap-2.5 md:ms-6">
            <LangToggle compact />
            <ThemeToggle className="hidden sm:inline-flex" />
            <Button size="sm" className="hidden h-10 px-6 sm:inline-flex" onClick={() => (window.location.href = user ? "/dashboard" : "/login")}>
              {user ? L.openApp : t.common.login}
            </Button>
            <button
              className="grid size-11 place-items-center rounded-full bg-surface-2 text-ink-2 md:hidden"
              aria-label={open ? t.common.close : t.common.menu}
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
            >
              {open ? <X className="size-5" /> : <MenuIcon className="size-5" />}
            </button>
          </div>
        </div>
        {open && (
          <div className="anim-fade border-t border-line bg-canvas px-5 pb-5 pt-3 md:hidden">
            <nav className="flex flex-col" aria-label="Mobile">
              {LANDING_SECTIONS.map(([id, key]) => (
                <button
                  key={id}
                  className="flex h-12 items-center justify-between border-b border-line text-start text-base font-semibold"
                  onClick={() => {
                    setOpen(false);
                    window.setTimeout(() => scrollToId(id), 60);
                  }}
                >
                  {L[key]}
                </button>
              ))}
            </nav>
            <div className="mt-4 flex items-center gap-3">
              <Button className="flex-1" onClick={() => (window.location.href = user ? "/dashboard" : "/login")}>
                {user ? L.openApp : t.common.login}
              </Button>
              <ThemeToggle className="sm:hidden" />
            </div>
          </div>
        )}
      </header>

      <main>
        <Hero onStart={start} />
        <Features />
        <Showcase />
        <Security />
        <About />
        <Faq />
        <CtaBar onStart={start} />
      </main>

      <Footer />
    </div>
  );
}

/* ───────────────────────── Hero ───────────────────────── */
function Hero({ onStart }: { onStart: () => void }) {
  const { t } = useI18n();
  const L = t.landing;
  const highlights: Array<{ icon: typeof Lock; tone: string; a: string; b: string }> = [
    { icon: ShieldCheck, tone: "text-emerald-500", a: L.hlE2e1, b: L.hlE2e2 },
    { icon: Zap, tone: "text-[#5b7bff]", a: L.hlFast1, b: L.hlFast2 },
    { icon: Lock, tone: "text-accent-ink", a: L.hlPriv1, b: L.hlPriv2 },
  ];
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid max-w-7xl items-center gap-6 px-5 pt-6 sm:px-8 lg:grid-cols-[1.02fr_1fr] lg:gap-4 lg:pt-10">
        <div className="relative z-10 pb-2 lg:pb-24">
          <h1 className="font-extrabold tracking-tight">
            <span dir="ltr" className="block whitespace-nowrap rtl:text-right text-[clamp(32px,10.6vw,52px)] leading-[1.05] sm:text-[68px] lg:text-[76px]">
              Panda Chat <span className="text-gradient">Pro</span>
            </span>
            <span className="mt-2 block text-[26px] font-bold leading-[1.25] min-[390px]:text-[30px] sm:text-4xl lg:text-[46px]">{L.heroTagline}</span>
          </h1>
          <p className="mt-5 max-w-[34rem] text-base leading-relaxed text-ink-2 sm:text-lg">{L.heroDesc}</p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button size="lg" onClick={onStart} className="sm:min-w-44">
              {t.common.getStarted}
              <ArrowRight className="size-[18px] rtl:-scale-x-100" />
            </Button>
            <Button size="lg" variant="secondary" onClick={() => scrollToId("features")} className="sm:min-w-44">
              <span className="grid size-6 place-items-center rounded-full bg-ink text-canvas">
                <Play className="size-3 fill-current rtl:-scale-x-100" />
              </span>
              {L.learnMore}
            </Button>
          </div>

          <ul className="mt-9 grid grid-cols-3 gap-2 sm:flex sm:gap-9">
            {highlights.map(({ icon: Icon, tone, a, b }) => (
              <li key={a} className="flex items-center gap-2">
                <Icon className={cn("size-6 shrink-0 sm:size-7", tone)} aria-hidden="true" />
                <span className="text-[11.5px] font-semibold leading-tight text-ink-2 sm:text-[13px]">
                  {a}
                  <br />
                  {b}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <Mascot />
      </div>
    </section>
  );
}

function Mascot() {
  const { t } = useI18n();
  return (
    <div className="relative mx-auto mt-4 w-full max-w-[420px] sm:max-w-[480px] lg:mt-0 lg:max-w-[540px]">
      {/* soft blobs */}
      <div
        className="absolute -inset-x-[10%] bottom-0 top-[22%] rounded-[46%_54%_40%_60%/52%_44%_56%_48%] bg-gradient-to-br from-[#cfc9ff] via-[#bcc3ff] to-[#a9bcff] opacity-90 dark:from-[#3b2fa6] dark:via-[#2f3896] dark:to-[#27408f] dark:opacity-80"
        aria-hidden="true"
      />
      <div className="absolute -start-[6%] bottom-[16%] size-24 rounded-full bg-[#b9b2ff]/60 blur-2xl dark:bg-[#5b3bff]/30" aria-hidden="true" />
      <span className="absolute end-[6%] top-[30%] size-3 rounded-full bg-[#7b8bff]" aria-hidden="true" />
      <span className="absolute start-[22%] top-[46%] size-2 rounded-full bg-[#9a8cff]" aria-hidden="true" />

      {/* shadow lives on the wrapper so the image's fade mask can't clip it into a box */}
      <div className="relative z-10 drop-shadow-[0_24px_30px_rgba(60,40,180,.22)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/panda-hero.webp"
          width={679}
          height={759}
          alt={t.landing.mascotAlt}
          className="block w-full object-contain [mask-image:linear-gradient(to_bottom,#000_86%,transparent_100%)]"
          fetchPriority="high"
        />
      </div>

      {/* floating chat bubbles */}
      <div
        className="anim-float absolute start-[-2%] top-[6%] z-20 grid h-[64px] w-[84px] place-items-center rounded-[26px] rounded-es-md bg-gradient-to-br from-[#7e62ff] to-[#5b3bff] shadow-brand sm:h-[80px] sm:w-[104px] lg:start-[-8%]"
        aria-hidden="true"
      >
        <span className="dot-typing flex gap-1.5 sm:gap-2">
          <span className="size-2.5 rounded-full bg-white sm:size-3" />
          <span className="size-2.5 rounded-full bg-white sm:size-3" />
          <span className="size-2.5 rounded-full bg-white sm:size-3" />
        </span>
      </div>
      <div
        className="anim-float absolute bottom-[26%] end-[-2%] z-20 grid size-[58px] place-items-center rounded-[22px] rounded-ee-md bg-white shadow-pop [animation-delay:-2.5s] sm:size-[72px] lg:end-[-4%]"
        aria-hidden="true"
      >
        <Heart className="size-7 fill-[#ff4d7d] text-[#ff4d7d] sm:size-9" />
      </div>
    </div>
  );
}

/* ───────────────────────── Features ───────────────────────── */
function SectionHead({ eyebrow, title, sub }: { eyebrow?: string; title: string; sub?: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      {eyebrow && <p className="mb-3 text-sm font-bold uppercase tracking-wider text-accent-ink">{eyebrow}</p>}
      <h2 className="text-[28px] font-extrabold leading-tight tracking-tight sm:text-4xl">{title}</h2>
      {sub && <p className="mt-4 text-base leading-relaxed text-ink-2 sm:text-lg">{sub}</p>}
    </div>
  );
}

function Features() {
  const { t } = useI18n();
  const L = t.landing;
  const items: Array<{ icon: typeof Lock; k: 1 | 2 | 3 | 4 | 5 | 6 }> = [
    { icon: Lock, k: 1 },
    { icon: Users, k: 2 },
    { icon: EyeOff, k: 3 },
    { icon: Timer, k: 4 },
    { icon: KeyRound, k: 5 },
    { icon: FileUp, k: 6 },
  ];
  return (
    <section id="features" className="scroll-mt-20 px-5 py-16 sm:px-8 sm:py-24">
      <div className="mx-auto max-w-7xl">
        <SectionHead eyebrow={L.navFeatures} title={L.featTitle} sub={L.featSub} />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
          {items.map(({ icon: Icon, k }) => (
            <article key={k} className="group rounded-3xl border border-line bg-surface p-6 shadow-card transition duration-300 hover:-translate-y-1 hover:border-brand/30 sm:p-7">
              <span className="mb-5 grid size-12 place-items-center rounded-2xl bg-brand-soft text-accent-ink transition group-hover:bg-brand group-hover:text-white">
                <Icon className="size-6" aria-hidden="true" />
              </span>
              <h3 className="text-lg font-bold">{L[`f${k}t` as keyof typeof L & string]}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{L[`f${k}d` as keyof typeof L & string]}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── Showcase (responsive / themes / RTL) ───────────────────────── */
function Showcase() {
  const { t, lang } = useI18n();
  const L = t.landing;
  const [dark, setDark] = useState<boolean | null>(null);
  const router = useRouter();

  const isDark = dark ?? (typeof document !== "undefined" ? document.documentElement.classList.contains("dark") : false);
  const toggleTheme = () => {
    const root = document.documentElement;
    const next = !root.classList.contains("dark");
    root.classList.toggle("dark", next);
    root.style.colorScheme = next ? "dark" : "light";
    setDark(next);
    try {
      localStorage.setItem("pc-theme", next ? "dark" : "light");
    } catch {
      /* private mode */
    }
  };
  const toggleLang = () => {
    const next = lang === "fa" ? "en" : "fa";
    document.cookie = `pc_lang=${next}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };

  return (
    <section className="bg-surface-2/60 px-5 py-16 sm:px-8 sm:py-24 dark:bg-surface/40">
      <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="mb-3 text-sm font-bold uppercase tracking-wider text-accent-ink">{L.respEyebrow}</p>
          <h2 className="text-[28px] font-extrabold leading-tight tracking-tight sm:text-4xl">{L.respTitle}</h2>
          <p className="mt-4 text-base leading-relaxed text-ink-2 sm:text-lg">{L.respDesc}</p>
          <div className="mt-7 grid gap-3 sm:grid-cols-2">
            <button
              onClick={toggleTheme}
              className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-start shadow-card transition hover:border-brand/40"
            >
              <span className="grid size-11 place-items-center rounded-xl bg-brand-soft text-accent-ink">{isDark ? <Sun className="size-5" /> : <Moon className="size-5" />}</span>
              <span>
                <span className="block text-[15px] font-bold">{L.themeTitle}</span>
                <span className="block text-sm text-muted">{isDark ? L.themeTryLight : L.themeTryDark}</span>
              </span>
            </button>
            <button
              onClick={toggleLang}
              className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-start shadow-card transition hover:border-brand/40"
            >
              <span className="grid size-11 place-items-center rounded-xl bg-brand-soft text-accent-ink">
                <Languages className="size-5" />
              </span>
              <span>
                <span className="block text-[15px] font-bold">{L.rtlTitle}</span>
                <span className="block text-sm text-muted">{lang === "fa" ? L.rtlTryEn : L.rtlTryFa}</span>
              </span>
            </button>
          </div>
        </div>
        <div className="pb-8">
          <ProductPreview />
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── Security ───────────────────────── */
function Security() {
  const { t } = useI18n();
  const L = t.landing;
  const points = [L.sec1, L.sec2, L.sec3, L.sec4, L.sec5, L.sec6];
  const facts = [
    { k: L.secKey1, v: L.secF1 },
    { k: L.secKey2, v: L.secF2 },
    { k: L.secKey3, v: L.secF3 },
  ];
  return (
    <section className="px-5 py-16 sm:px-8 sm:py-24">
      <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[32px] border border-white/5 bg-side p-7 text-white shadow-pop sm:p-12">
        <div className="absolute -end-24 -top-24 size-80 rounded-full bg-brand/30 blur-3xl" aria-hidden="true" />
        <div className="relative grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
          <div>
            <p className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[#a898ff]">
              <Fingerprint className="size-5" aria-hidden="true" />
              {L.secEyebrow}
            </p>
            <h2 className="text-[28px] font-extrabold leading-tight tracking-tight sm:text-4xl">{L.secTitle}</h2>
            <ul className="mt-7 space-y-3.5">
              {points.map((p) => (
                <li key={p} className="flex items-start gap-3 text-[15px] leading-relaxed text-white/85 sm:text-base">
                  <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-emerald-500 text-white">
                    <Check className="size-3.5" strokeWidth={3} aria-hidden="true" />
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
          <div className="grid gap-3.5">
            {facts.map((f) => (
              <div key={f.k} className="flex items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-5">
                <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand text-white">
                  <ShieldCheck className="size-6" aria-hidden="true" />
                </span>
                <div dir="auto">
                  <div className="text-lg font-extrabold" dir="ltr">
                    {f.k}
                  </div>
                  <div className="text-sm text-white/65">{f.v}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── About / FAQ ───────────────────────── */
function About() {
  const { t } = useI18n();
  const L = t.landing;
  return (
    <section id="about" className="scroll-mt-20 px-5 pb-16 sm:px-8 sm:pb-24">
      <div className="mx-auto max-w-3xl text-center">
        <p className="mb-3 text-sm font-bold uppercase tracking-wider text-accent-ink">{L.navAbout}</p>
        <h2 className="text-[28px] font-extrabold leading-tight tracking-tight sm:text-4xl">{L.aboutTitle}</h2>
        <p className="mt-5 text-base leading-relaxed text-ink-2 sm:text-lg">{L.aboutP1}</p>
        <p className="mt-4 text-base leading-relaxed text-ink-2 sm:text-lg">{L.aboutP2}</p>
      </div>
    </section>
  );
}

function Faq() {
  const { t } = useI18n();
  const L = t.landing;
  return (
    <section id="faq" className="scroll-mt-20 px-5 pb-16 sm:px-8 sm:pb-24">
      <div className="mx-auto max-w-3xl">
        <SectionHead title={L.faqTitle} eyebrow={L.navFaq} />
        <div className="mt-10 space-y-3">
          {([1, 2, 3, 4, 5] as const).map((n) => (
            <details key={n} className="group rounded-2xl border border-line bg-surface shadow-card open:border-brand/30">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 text-start text-base font-bold marker:hidden [&::-webkit-details-marker]:hidden">
                {L[`faqQ${n}` as keyof typeof L & string]}
                <ChevronDown className="size-5 shrink-0 text-muted transition group-open:rotate-180" aria-hidden="true" />
              </summary>
              <p className="px-5 pb-5 text-[15px] leading-relaxed text-ink-2">{L[`faqA${n}` as keyof typeof L & string]}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────── CTA + footer ───────────────────────── */
function CtaBar({ onStart }: { onStart: () => void }) {
  const { t } = useI18n();
  const L = t.landing;
  return (
    <section className="px-5 pb-16 sm:px-8 sm:pb-24">
      <div className="relative mx-auto flex max-w-7xl flex-col items-start gap-5 overflow-hidden rounded-[28px] bg-gradient-to-r from-[#3a21d4] via-[#5b3bff] to-[#7d66ff] p-6 text-white shadow-brand sm:flex-row sm:items-center sm:gap-8 sm:px-10 sm:py-8">
        <div className="absolute -end-10 -top-16 size-56 rounded-full bg-white/10" aria-hidden="true" />
        <Logo size={52} href={null} onDark className="[&_span:last-child]:text-2xl sm:[&_span:last-child]:text-3xl" />
        <span className="hidden h-10 w-px bg-white/30 sm:block" aria-hidden="true" />
        <p className="text-base font-medium text-white/85 sm:flex-1 sm:text-lg">
          {L.wordModern} <span className="mx-1.5 opacity-60">•</span> {L.wordSecure} <span className="mx-1.5 opacity-60">•</span> {L.wordPowerful}
        </p>
        <button
          onClick={onStart}
          className="relative inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white px-7 text-base font-bold text-accent transition active:scale-[.98] sm:w-auto"
        >
          {t.common.getStarted}
          <ArrowRight className="size-[18px] rtl:-scale-x-100" />
        </button>
      </div>
    </section>
  );
}

function Footer() {
  const { t } = useI18n();
  const L = t.landing;
  return (
    <footer className="border-t border-line px-5 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-10 sm:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 md:flex-row md:items-start md:justify-between">
        <div className="max-w-xs">
          <Logo size={36} href={null} />
          <p className="mt-3 text-sm leading-relaxed text-muted">{L.footTag}</p>
        </div>
        <nav className="flex flex-wrap gap-x-8 gap-y-3 text-sm font-semibold text-ink-2" aria-label="Footer">
          {LANDING_SECTIONS.map(([id, key]) => (
            <button key={id} onClick={() => scrollToId(id)} className="hover:text-accent-ink">
              {L[key]}
            </button>
          ))}
          <Link href="/login" className="hover:text-accent-ink">
            {t.common.login}
          </Link>
          <Link href="/register" className="hover:text-accent-ink">
            {L.createAccount}
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          <LangToggle compact />
          <ThemeToggle />
        </div>
      </div>
      <p className="mx-auto mt-8 max-w-7xl text-xs text-muted">© {new Date().getFullYear()} Panda Chat Pro</p>
    </footer>
  );
}
