"use client";

import {
  Bot,
  CircleUser,
  Cookie,
  Database,
  Download,
  Fingerprint,
  KeyRound,
  Languages,
  Laptop,
  Link2,
  LockKeyhole,
  LogOut,
  MonitorSmartphone,
  Palette,
  Server,
  ShieldCheck,
  Smartphone,
  SquarePlus,
  Timer,
  Trash2,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { LangToggle, ThemeToggle } from "@/components/ui";
import { CheckItem, IconTile, Section, SectionHead, SubHead, type Icon, type Tone } from "./ui";

/* ───────────────────────── Account & sessions ───────────────────────── */
const accountCards: { icon: Icon; tone: Tone; title: string; text: string }[] = [
  {
    icon: UserRound,
    tone: "accent",
    title: "پروفایل",
    text: "نام نمایشی (۱ تا ۴۰ کاراکتر) که به افراد حاضر در اتاق‌هایتان نشان داده می‌شود. تاریخ عضویت شما هم همین‌جا دیده می‌شود.",
  },
  {
    icon: KeyRound,
    tone: "lavender",
    title: "رمز عبور",
    text: "تغییر رمز با وارد کردن رمز فعلی. بلافاصله پس از تغییر، همه نشست‌های دیگر شما به‌طور خودکار خارج می‌شوند.",
  },
  {
    icon: MonitorSmartphone,
    tone: "sky",
    title: "نشست‌ها",
    text: "فهرست دستگاه‌هایی که با آن‌ها وارد شده‌اید با برچسب «این دستگاه»، «به خاطر سپرده‌شده» یا «تا رفرش بعدی»، و دکمه «خروج از دستگاه‌های دیگر».",
  },
  {
    icon: Bot,
    tone: "mint",
    title: "تلگرام",
    text: "اتصال یا قطع ربات رسمی، روشن و خاموش کردن «ارسال پیام‌ها» و دیدن فهرست اتاق‌های بی‌صدا برای فعال‌سازی دوباره.",
  },
  {
    icon: Download,
    tone: "amber",
    title: "اپلیکیشن",
    text: "نصب پاندا چت روی دستگاه، تا مثل یک اپ واقعی از صفحه اصلی باز شود.",
  },
  {
    icon: Trash2,
    tone: "rose",
    title: "حذف حساب",
    text: "حساب شما همراه با همه اتاق‌ها، پیام‌ها و اتصال‌های ربات برای همیشه حذف می‌شود. برای تأیید، وارد کردن رمز عبور لازم است.",
  },
];

export function Account() {
  return (
    <Section id="account">
      <SectionHead
        icon={CircleUser}
        kicker="حساب کاربری و نشست‌ها"
        title="هر آنچه به حساب شما مربوط است"
        lead="از صفحه حساب کاربری، پروفایل، رمز عبور، دستگاه‌های واردشده، اتصال تلگرام و نصب اپلیکیشن را مدیریت می‌کنید."
      />

      <div className="mt-10 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {accountCards.map((c) => (
          <article key={c.title} className="card p-5 transition duration-300 hover:-translate-y-0.5 hover:shadow-card">
            <IconTile icon={c.icon} tone={c.tone} className="size-10 rounded-xl" />
            <h4 className="mt-4 font-extrabold text-ink">{c.title}</h4>
            <p className="mt-1.5 text-sm leading-7 text-muted">{c.text}</p>
          </article>
        ))}
      </div>

      {/* Remember me */}
      <div className="mt-12 grid items-center gap-8 rounded-[1.5rem] border border-line bg-surface-2 p-6 sm:p-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div>
          <SubHead>«مرا به خاطر بسپار» دقیقاً چه می‌کند؟</SubHead>
          <p className="mt-2 text-sm leading-7 text-muted">
            این گزینه در صفحه ورود تعیین می‌کند نشست شما روی آن دستگاه چقدر باقی بماند. همین انتخاب است که در فهرست
            نشست‌ها با برچسب «به خاطر سپرده‌شده» یا «تا رفرش بعدی» نمایش داده می‌شود.
          </p>
          <label className="mt-6 flex items-start gap-3 rounded-xl border border-line bg-surface p-3.5 shadow-soft">
            <input type="checkbox" className="checkbox mt-1" checked readOnly tabIndex={-1} aria-hidden="true" />
            <span>
              <span className="block text-sm font-bold text-ink">مرا به خاطر بسپار</span>
              <span className="mt-0.5 block text-xs leading-6 text-muted">
                حتی پس از بستن مرورگر در این دستگاه وارد بمانید. اگر تیک نزنید، با رفرش صفحه از حساب خارج می‌شوید.
              </span>
            </span>
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-line bg-surface p-5">
            <span className="badge badge-mint">با تیک</span>
            <p className="mt-3 font-extrabold text-ink">به خاطر سپرده‌شده</p>
            <p className="mt-1.5 text-sm leading-7 text-muted">
              حتی بعد از بستن مرورگر وارد می‌مانید. مناسب گوشی یا رایانه شخصی خودتان.
            </p>
          </div>
          <div className="rounded-2xl border border-line bg-surface p-5">
            <span className="badge badge-amber">بدون تیک</span>
            <p className="mt-3 font-extrabold text-ink">تا رفرش بعدی</p>
            <p className="mt-1.5 text-sm leading-7 text-muted">
              با یک رفرش ساده از حساب خارج می‌شوید. مناسب دستگاه‌های مشترک، عمومی یا امانی.
            </p>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ───────────────────────── Security & privacy ───────────────────────── */
const securityItems: { icon: Icon; title: string; text: string }[] = [
  {
    icon: Link2,
    title: "لینک‌های ۲۵۶ بیتی",
    text: "هر لینک دعوت از یک توکن کاملاً تصادفی ساخته می‌شود؛ حدس زدن آن عملاً ممکن نیست و هر زمان قابل تعویض است.",
  },
  {
    icon: LockKeyhole,
    title: "دروازه رمز روی سرور",
    text: "در اتاق‌های رمزدار، رمز پیش از ارسال حتی یک پیام به مرورگر، روی سرور بررسی می‌شود.",
  },
  {
    icon: KeyRound,
    title: "رمزهای هش‌شده",
    text: "رمز حساب‌ها و اتاق‌ها با scrypt هش می‌شوند و هرگز به‌صورت متن ساده ذخیره نمی‌شوند.",
  },
  {
    icon: Server,
    title: "توکن‌ها روی سرور می‌مانند",
    text: "توکن‌های ربات رمزنگاری‌شده ذخیره می‌شوند و هرگز به مرورگر شما ارسال نمی‌شوند.",
  },
  {
    icon: Cookie,
    title: "نشست‌های HttpOnly",
    text: "کوکی نشست از دسترس اسکریپت‌های صفحه دور است. بدون «مرا به خاطر بسپار»، با یک رفرش از حساب خارج می‌شوید.",
  },
  {
    icon: Timer,
    title: "محدودیت تلاش‌ها",
    text: "تلاش‌های پیاپی و زیاد — مثلاً برای حدس زدن رمز — موقتاً متوقف می‌شوند تا کمی صبر کنید.",
  },
  {
    icon: ShieldCheck,
    title: "کنسول مدیریت جداگانه",
    text: "مدیریت پلتفرم در یک آدرس خصوصی و قابل تنظیم قرار دارد و همه اقدامات مدیر در گزارش ممیزی ثبت می‌شود.",
  },
  {
    icon: LogOut,
    title: "خروج از راه دور",
    text: "تغییر رمز عبور، نشست‌های دیگر را خارج می‌کند و از فهرست نشست‌ها هم می‌توانید دستگاه‌های دیگر را بیرون کنید.",
  },
];

export function Security() {
  return (
    <Section id="security">
      <div className="rounded-[1.75rem] border border-line bg-gradient-to-bl from-surface via-surface to-lavender-soft p-6 shadow-soft sm:p-10">
        <SectionHead icon={ShieldCheck} kicker="امنیت و حریم خصوصی" title="با دقت، به‌طور پیش‌فرض" />
        <div className="mt-10 grid gap-7 sm:grid-cols-2 xl:grid-cols-4">
          {securityItems.map((s) => (
            <div key={s.title}>
              <IconTile icon={s.icon} tone="surface" />
              <h3 className="mt-4 font-extrabold text-ink">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-7 text-muted">{s.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Your data */}
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <div className="card p-6">
          <div className="flex items-center gap-3">
            <IconTile icon={Database} tone="accent" className="size-10 rounded-xl" />
            <h3 className="text-base font-extrabold text-ink">آنچه نگه‌داری می‌شود</h3>
          </div>
          <ul className="mt-5 space-y-1.5">
            <CheckItem>نام کاربری، نام نمایشی و هش رمز عبور شما.</CheckItem>
            <CheckItem>اتاق‌ها، اعضا و پیام‌ها — تا وقتی شما یا مالک اتاق آن‌ها را حذف کنید.</CheckItem>
            <CheckItem>فایل‌های پیوست، فقط به مدت یک روز.</CheckItem>
            <CheckItem>نشست‌های فعال، تا بتوانید دستگاه‌های واردشده را ببینید و مدیریت کنید.</CheckItem>
            <CheckItem>نسخه‌های پشتیبان منظم، تا در صورت بروز مشکل فنی اطلاعات از دست نرود.</CheckItem>
          </ul>
        </div>
        <div className="card p-6">
          <div className="flex items-center gap-3">
            <IconTile icon={Fingerprint} tone="rose" className="size-10 rounded-xl" />
            <h3 className="text-base font-extrabold text-ink">آنچه از شما خواسته نمی‌شود</h3>
          </div>
          <ul className="mt-5 space-y-1.5">
            <CheckItem tone="rose">شماره تلفن — برای ثبت‌نام یا ورود لازم نیست.</CheckItem>
            <CheckItem tone="rose">ایمیل یا هر اطلاعات هویتی دیگر.</CheckItem>
            <CheckItem tone="rose">رمزها هرگز به‌صورت متن ساده ذخیره نمی‌شوند.</CheckItem>
            <CheckItem tone="rose">توکن ربات هرگز به مرورگر فرستاده نمی‌شود.</CheckItem>
          </ul>
        </div>
      </div>

      <p className="notice notice-amber mt-4">
        <TriangleAlert className="mt-1 size-4 shrink-0" aria-hidden="true" />
        <span>
          برای نمایش تاریخچه، پیام‌ها روی سرور نگه‌داری می‌شوند و اگر اعلان تلگرام را روشن کنید، متن پیام‌ها به تلگرام
          شما هم فرستاده می‌شود. اطلاعات بسیار حساس — مثل رمز کارت بانکی یا رمزهای عبور — را در هیچ گفتگوی آنلاینی
          نفرستید.
        </span>
      </p>
    </Section>
  );
}

/* ───────────────────────── App, appearance & language ───────────────────────── */
const installWays: { icon: Icon; tone: Tone; title: string; steps: string[] }[] = [
  {
    icon: Laptop,
    tone: "accent",
    title: "اندروید و رایانه",
    steps: [
      "در مرورگرهایی مثل Chrome یا Edge وارد حساب کاربری شوید.",
      "در بخش «اپلیکیشن»، دکمه «نصب اپلیکیشن» را بزنید و نصب را تأیید کنید.",
    ],
  },
  {
    icon: Smartphone,
    tone: "lavender",
    title: "آیفون و آیپد",
    steps: [
      "پاندا چت را در Safari باز کنید و دکمه اشتراک‌گذاری را بزنید.",
      "گزینه «Add to Home Screen» را انتخاب کنید.",
    ],
  },
  {
    icon: SquarePlus,
    tone: "mint",
    title: "بعد از نصب",
    steps: [
      "پاندا چت مستقیم از صفحه اصلی، در پنجره‌ای مستقل و با داشبورد باز می‌شود.",
      "در اندروید با نگه داشتن آیکون، میان‌برهای «اتاق‌ها» و «حساب کاربری» در دسترس است.",
    ],
  },
];

export function AppAndLooks() {
  return (
    <Section id="app">
      <SectionHead
        icon={MonitorSmartphone}
        kicker="اپلیکیشن، ظاهر و زبان"
        title="پاندا چت، همان‌طور که دوست دارید"
        lead="پاندا چت را مثل یک اپ روی دستگاه نصب کنید، تم روشن یا تیره را انتخاب کنید و بین فارسی و انگلیسی جابه‌جا شوید."
      />

      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {installWays.map((w) => (
          <div key={w.title} className="card p-6">
            <IconTile icon={w.icon} tone={w.tone} />
            <h3 className="mt-5 font-extrabold text-ink">{w.title}</h3>
            <ol className="mt-3 space-y-2">
              {w.steps.map((s, i) => (
                <li key={s} className="flex gap-2.5 text-sm leading-7 text-muted">
                  <span className="mt-1 grid size-5 shrink-0 place-items-center rounded-md bg-surface-3 text-[11px] font-extrabold text-ink-2">
                    {["۱", "۲"][i]}
                  </span>
                  {s}
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Theme */}
        <div className="card p-6">
          <div className="flex items-center gap-3">
            <IconTile icon={Palette} tone="lavender" className="size-10 rounded-xl" />
            <h3 className="font-extrabold text-ink">تم روشن و تیره</h3>
          </div>
          <p className="mt-4 text-sm leading-7 text-muted">
            تم انتخابی روی همین دستگاه ذخیره می‌شود. اگر انتخابی نکرده باشید، پاندا چت از تنظیم روشن یا تیره سیستم شما
            پیروی می‌کند. همین حالا امتحان کنید:
          </p>
          <div className="mt-5">
            <ThemeToggle />
          </div>
        </div>

        {/* Language */}
        <div className="card p-6">
          <div className="flex items-center gap-3">
            <IconTile icon={Languages} tone="sky" className="size-10 rounded-xl" />
            <h3 className="font-extrabold text-ink">فارسی و انگلیسی</h3>
          </div>
          <p className="mt-4 text-sm leading-7 text-muted">
            با دکمه تغییر زبان، کل رابط بین فارسی و انگلیسی جابه‌جا می‌شود. در حالت فارسی، چیدمان کاملاً
            راست‌به‌چپ است و متن‌ها با فونت وزیرمتن نمایش داده می‌شوند؛ نام‌های کاربری، لینک‌ها و دستورها همچنان
            چپ‌به‌راست می‌مانند تا درست خوانده شوند.
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <LangToggle />
            <span className="badge badge-sky">
              <Languages className="size-3" aria-hidden="true" /> فارسی · راست‌به‌چپ
            </span>
            <span className="badge badge-neutral" dir="ltr">
              English · LTR
            </span>
          </div>
        </div>
      </div>
    </Section>
  );
}
