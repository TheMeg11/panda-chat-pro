"use client";

import type { ReactNode } from "react";
import {
  BellOff,
  Bot,
  CircleCheck,
  Eraser,
  KeyRound,
  Lock,
  LockOpen,
  MessageCircle,
  Pencil,
  RefreshCw,
  Reply,
  SendHorizontal,
  Trash2,
  TriangleAlert,
  Unplug,
  UserCheck,
  UserX,
  Wrench,
  Zap,
} from "lucide-react";
import { CommandChip, IconTile, Point, Section, SectionHead, SubHead, toFa, type Icon, type Tone } from "./ui";

/* ───────────────────────── Moderation ───────────────────────── */
const tools: { icon: Icon; tone: Tone; name: string; where: string; cmd?: string; effect: string; danger?: boolean }[] = [
  {
    icon: Lock,
    tone: "lavender",
    name: "قفل اتاق",
    where: "مدیریت ← امنیت",
    cmd: "/lock",
    effect: "اعضا فقط می‌خوانند و فقط مالک پیام می‌فرستد. کادر نوشتن اعضا پیام «این اتاق قفل است» را نشان می‌دهد.",
  },
  {
    icon: LockOpen,
    tone: "lavender",
    name: "باز کردن قفل",
    where: "مدیریت ← امنیت",
    effect: "همه اعضا دوباره می‌توانند پیام بفرستند. قفل و باز شدن اتاق در گفتگو ثبت می‌شود.",
  },
  {
    icon: RefreshCw,
    tone: "accent",
    name: "ساخت لینک جدید",
    where: "مدیریت ← اشتراک",
    cmd: "/newlink",
    effect: "لینک دعوت قبلی همان لحظه از کار می‌افتد و فقط لینک تازه برای ورود معتبر است.",
  },
  {
    icon: KeyRound,
    tone: "accent",
    name: "تغییر یا حذف رمز",
    where: "مدیریت ← امنیت",
    cmd: "/password",
    effect: "با تغییر رمز، همه باید رمز جدید را وارد کنند. با حذف رمز، داشتن لینک برای ورود کافی است.",
  },
  {
    icon: UserX,
    tone: "rose",
    name: "حذف عضو",
    where: "مدیریت ← اعضا",
    cmd: "/kick",
    effect: "عضو از اتاق بیرون می‌رود و دیگر نمی‌تواند از همان دستگاه دوباره وارد شود.",
  },
  {
    icon: UserCheck,
    tone: "mint",
    name: "اجازه بازگشت",
    where: "مدیریت ← اعضا",
    effect: "عضو حذف‌شده دوباره می‌تواند با لینک دعوت وارد اتاق شود.",
  },
  {
    icon: Trash2,
    tone: "rose",
    name: "حذف پیام",
    where: "روی خود پیام / دکمه «حذف» در تلگرام",
    effect: "پیام برای همه اعضا حذف می‌شود و جای آن «پیام حذف‌شده» نمایش داده می‌شود.",
  },
  {
    icon: Pencil,
    tone: "amber",
    name: "ویرایش مشخصات",
    where: "مدیریت ← تنظیمات",
    effect: "نام و توضیحات اتاق برای همه اعضا به‌روز می‌شود.",
  },
  {
    icon: Eraser,
    tone: "rose",
    name: "پاک کردن تاریخچه",
    where: "تنظیمات ← منطقه خطر",
    effect: "همه پیام‌های اتاق برای همه حذف می‌شود؛ خود اتاق و لینک آن باقی می‌ماند.",
    danger: true,
  },
  {
    icon: TriangleAlert,
    tone: "rose",
    name: "حذف اتاق",
    where: "تنظیمات ← منطقه خطر",
    effect: "اتاق، پیام‌ها، اعضا و اتصال ربات آن برای همیشه حذف می‌شود.",
    danger: true,
  },
];

export function Moderation() {
  return (
    <Section id="moderation">
      <SectionHead
        icon={Wrench}
        kicker="مدیریت اتاق"
        title="ابزارهای مالک، و اثر دقیق هر کدام"
        lead="ابزارهای مدیریتی فقط برای مالک اتاق در دسترس است؛ از زبانه «مدیریت» در وب، و بسیاری از آن‌ها از طریق ربات تلگرام. پیش از هر اقدام، بدانید دقیقاً چه اتفاقی می‌افتد:"
      />

      <div className="card mt-10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table min-w-[640px]">
            <thead>
              <tr>
                <th>ابزار</th>
                <th>کجاست</th>
                <th>چه اتفاقی می‌افتد</th>
              </tr>
            </thead>
            <tbody>
              {tools.map((t) => (
                <tr key={t.name}>
                  <td className="whitespace-nowrap">
                    <span className="flex items-center gap-2.5 font-extrabold text-ink">
                      <IconTile icon={t.icon} tone={t.tone} className="size-8 rounded-lg [&_svg]:size-4" />
                      {t.name}
                      {t.danger ? <span className="badge badge-rose h-5 text-[0.62rem]">برگشت‌ناپذیر</span> : null}
                    </span>
                  </td>
                  <td className="whitespace-nowrap text-[0.8rem] text-muted">
                    <span className="block">{t.where}</span>
                    {t.cmd ? (
                      <span dir="ltr" className="mt-1 inline-block font-mono text-[11px] font-bold text-accent-ink">
                        {t.cmd}
                      </span>
                    ) : null}
                  </td>
                  <td className="min-w-[260px] text-[0.84rem] leading-7 text-ink-2">{t.effect}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <p className="notice notice-rose">
          <TriangleAlert className="mt-1 size-4 shrink-0" aria-hidden="true" />
          <span>
            اقدام‌های «منطقه خطر» قابل بازگشت نیستند. پاندا چت پیش از اجرای آن‌ها از شما تأیید می‌گیرد؛ با دقت تأیید
            کنید.
          </span>
        </p>
        <p className="notice notice-amber">
          <Wrench className="mt-1 size-4 shrink-0" aria-hidden="true" />
          <span>
            مدیر پلتفرم در صورت لزوم می‌تواند یک اتاق را غیرفعال کند. در این حالت برچسب «غیرفعال» روی اتاق می‌نشیند و
            اعضا موقتاً به آن دسترسی ندارند.
          </span>
        </p>
      </div>
    </Section>
  );
}

/* ───────────────────────── Telegram ───────────────────────── */
const commands: { cmd: string; text: string }[] = [
  { cmd: "/start", text: "اتصال حساب پاندا چت با کد یک‌بارمصرف" },
  { cmd: "/status", text: "نمایش وضعیت اتاق" },
  { cmd: "/link", text: "دریافت لینک دعوت فعلی" },
  { cmd: "/newlink", text: "ساخت لینک تازه و از کار انداختن لینک قبلی" },
  { cmd: "/lock", text: "قفل کردن اتاق؛ فقط شما پیام می‌فرستید" },
  { cmd: "/kick", text: "حذف یک عضو از اتاق" },
  { cmd: "/password", text: "تغییر رمز اتاق" },
  { cmd: "/recent", text: "مرور پیام‌های اخیر اتاق" },
  { cmd: "/mute", text: "بی‌صدا کردن اعلان‌های اتاق در تلگرام" },
];

const connectSteps: ReactNode[] = [
  <>
    به <b className="text-ink">حساب کاربری ← تلگرام</b> بروید و «اتصال تلگرام» را بزنید. یک کد یک‌بارمصرف خصوصی
    ساخته می‌شود که {toFa(15)} دقیقه اعتبار دارد.
  </>,
  <>
    «باز کردن در تلگرام» را بزنید؛ تلگرام باز می‌شود و پیام <span dir="ltr" className="font-mono font-bold text-accent-ink">/start</span> همراه کد از قبل آماده است. فقط آن را بفرستید.
  </>,
  <>ربات اتصال را تأیید می‌کند و صفحه خودکار تازه می‌شود. برچسب «متصل» یعنی همه‌چیز آماده است.</>,
];

const controls: { icon: Icon; tone: Tone; title: string; text: string }[] = [
  {
    icon: BellOff,
    tone: "sky",
    title: "اعلان هر اتاق",
    text: "کلید اعلان هر اتاق جداگانه در زبانه «تلگرام» همان اتاق است. اتاق بی‌صدا تا وقتی دوباره فعالش نکنید به تلگرام ارسال نمی‌شود.",
  },
  {
    icon: Zap,
    tone: "accent",
    title: "توقف کلی ارسال",
    text: "از «حساب کاربری ← تلگرام» می‌توانید «ارسال پیام‌ها» را برای همه اتاق‌ها یک‌جا متوقف یا دوباره روشن کنید.",
  },
  {
    icon: CircleCheck,
    tone: "mint",
    title: "پیام آزمایشی",
    text: "در زبانه تلگرام هر اتاق، «ارسال پیام آزمایشی» را بزنید تا از درستی اتصال مطمئن شوید.",
  },
  {
    icon: Unplug,
    tone: "rose",
    title: "قطع اتصال",
    text: "هر زمان بخواهید، اتصال گفتگوی تلگرام را از حساب کاربری قطع کنید؛ دیگر پیامی به تلگرام ارسال نمی‌شود.",
  },
];

export function Telegram() {
  return (
    <Section id="telegram">
      <SectionHead
        icon={Bot}
        kicker="ربات تلگرام"
        title="اتاق شما، همیشه در جیب شما"
        lead="با اتصال حساب به ربات رسمی پاندا چت، تلگرام شما به یک پنل کنترل بی‌صدا تبدیل می‌شود: پیام‌های جدید همان لحظه می‌رسند و پاسخ‌های شما مستقیم به اتاق برمی‌گردند."
      />

      <div className="mt-10">
        <SubHead>اتصال در سه قدم</SubHead>
        <ol className="mt-5 space-y-4">
          {connectSteps.map((s, i) => (
            <li key={i} className="flex gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-2 text-xs font-extrabold text-on-accent">
                {toFa(i + 1)}
              </span>
              <p className="text-sm leading-7 text-ink-2">{s}</p>
            </li>
          ))}
        </ol>

        <SubHead className="mt-10">بعد از اتصال چه کارهایی می‌توانید بکنید؟</SubHead>
        <ul className="mt-5 space-y-3.5">
          <Point icon={MessageCircle}>پیام‌های جدید همه اتاق‌هایتان همان لحظه در تلگرام می‌رسد.</Point>
          <Point icon={Reply}>
            روی پیام فرستاده‌شده ریپلای کنید تا پاسخ‌تان در اتاق منتشر شود؛ این پیام‌ها با برچسب «ارسال‌شده از
            تلگرام» دیده می‌شوند.
          </Point>
          <Point icon={Trash2}>با دکمه‌های زیر هر پیام، با یک لمس پیام را حذف کنید یا فرستنده را بیرون کنید.</Point>
          <Point icon={SendHorizontal}>با دستورها قفل کنید، نام را تغییر دهید یا لینک و رمز را عوض کنید.</Point>
        </ul>
      </div>

      {/* commands */}
      <div className="mt-14">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <SubHead>چند نمونه از دستورها</SubHead>
          <p className="text-xs font-semibold text-muted">با لمس هر دستور، کپی می‌شود.</p>
        </div>
        <div className="mt-5 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {commands.map((c) => (
            <div key={c.cmd} className="flex items-center gap-3 rounded-xl border border-line bg-surface-2 p-3">
              <CommandChip cmd={c.cmd} className="shrink-0" />
              <span className="text-[0.82rem] leading-6 text-ink-2">{c.text}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs leading-6 text-muted">
          فهرست کامل و به‌روز دستورها همیشه در زبانه «تلگرام» هر اتاق، زیر عنوان «دستورهای ربات» در دسترس است.
        </p>
      </div>

      {/* notification controls */}
      <div className="mt-12 grid gap-3 sm:grid-cols-2">
        {controls.map((c) => (
          <div key={c.title} className="card flex gap-4 p-5">
            <IconTile icon={c.icon} tone={c.tone} className="size-10 rounded-xl" />
            <div>
              <h4 className="font-extrabold text-ink">{c.title}</h4>
              <p className="mt-1 text-sm leading-7 text-muted">{c.text}</p>
            </div>
          </div>
        ))}
      </div>

      <p className="notice notice-accent mt-5">
        <Bot className="mt-1 size-4 shrink-0" aria-hidden="true" />
        <span>
          بسته به تنظیمات پلتفرم، ربات ممکن است «رایگان برای همه» باشد یا فقط برای حساب‌های «ویژه» فعال شود. اگر
          دسترسی به ربات برای حساب شما فعال نیست، از مدیر بخواهید آن را فعال کند و بعد از همان بخش وصل شوید.
        </span>
      </p>
    </Section>
  );
}
