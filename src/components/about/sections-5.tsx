"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, CircleHelp, Clock, Lightbulb, ListChecks, MonitorSmartphone, RefreshCw, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconTile, Section, SectionHead, toFa } from "./ui";

/* ───────────────────────── Limits ───────────────────────── */
const limits: { group: string; rows: { item: string; rule: ReactNode }[] }[] = [
  {
    group: "حساب کاربری",
    rows: [
      { item: "نام کاربری", rule: "۳ تا ۲۴ کاراکتر — حروف انگلیسی، عدد، نقطه یا زیرخط" },
      { item: "نام نمایشی", rule: "۱ تا ۴۰ کاراکتر" },
      { item: "رمز عبور حساب", rule: "حداقل ۸ کاراکتر" },
    ],
  },
  {
    group: "اتاق‌ها",
    rows: [
      { item: "نام اتاق", rule: "۱ تا ۶۰ کاراکتر" },
      { item: "رمز اتاق", rule: "اختیاری — در صورت تنظیم، حداقل ۴ کاراکتر" },
      { item: "نام مستعار در اتاق", rule: "۱ تا ۲۴ کاراکتر؛ برای همه اعضای همان اتاق قابل مشاهده" },
      { item: "لینک دعوت", rule: "توکن تصادفی ۲۵۶ بیتی؛ هر زمان قابل تعویض" },
      { item: "تعداد اتاق‌ها", rule: "سقف تعیین‌شده توسط مدیر پلتفرم — در داشبورد نمایش داده می‌شود" },
    ],
  },
  {
    group: "پیام‌ها و فایل‌ها",
    rows: [
      { item: "طول پیام", rule: "سقف تعیین‌شده توسط مدیر — نزدیک سقف، شمارنده کاراکتر ظاهر می‌شود" },
      { item: "نگه‌داری فایل‌ها", rule: "یک روز؛ پس از آن فایل «منقضی» می‌شود" },
      { item: "حجم و نوع فایل", rule: "محدود؛ فایل‌های خیلی بزرگ یا انواع پشتیبانی‌نشده پذیرفته نمی‌شوند" },
      { item: "گفتگوهای خصوصی", rule: "تعداد محدود برای هر حساب" },
    ],
  },
  {
    group: "تلگرام و دستگاه",
    rows: [
      { item: "کد اتصال تلگرام", rule: `یک‌بارمصرف، با ${toFa(15)} دقیقه اعتبار` },
      { item: "رمز چت‌های مخفی", rule: "حداقل ۴ کاراکتر؛ فقط روی همان دستگاه ذخیره می‌شود" },
      { item: "تلاش‌های پیاپی", rule: "در صورت تلاش‌های زیاد، باید کمی صبر کنید و دوباره امتحان کنید" },
    ],
  },
];

export function Limits() {
  return (
    <Section id="limits">
      <SectionHead
        icon={ListChecks}
        kicker="محدودیت‌ها و قواعد"
        title="اعداد و قواعدی که بهتر است بدانید"
        lead="همه محدودیت‌های فرم‌ها و قواعد نگه‌داری داده‌ها، یک‌جا. برخی سقف‌ها را مدیر پلتفرم تعیین می‌کند و ممکن است در طول زمان تغییر کنند."
      />
      <div className="card mt-10 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table min-w-[560px]">
            <thead>
              <tr>
                <th className="w-[38%]">مورد</th>
                <th>قاعده</th>
              </tr>
            </thead>
            {limits.map((g) => (
              <tbody key={g.group}>
                <tr>
                  <td colSpan={2} className="bg-surface-2 py-2 text-xs font-extrabold text-accent-ink">
                    {g.group}
                  </td>
                </tr>
                {g.rows.map((r) => (
                  <tr key={r.item}>
                    <td className="font-bold text-ink">{r.item}</td>
                    <td className="leading-7 text-ink-2">{r.rule}</td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </div>
    </Section>
  );
}

/* ───────────────────────── Tips ───────────────────────── */
const tips: { icon: typeof RefreshCw; tone: "accent" | "lavender" | "sky" | "mint" | "amber" | "rose"; title: string; text: string }[] = [
  {
    icon: RefreshCw,
    tone: "lavender",
    title: "لینک لو رفت؟ همان لحظه عوضش کنید",
    text: "«ساخت لینک جدید» لینک قبلی را فوراً از کار می‌اندازد. اگر اتاق رمز دارد، رمز را هم تغییر دهید تا همه رمز تازه را وارد کنند.",
  },
  {
    icon: MonitorSmartphone,
    tone: "sky",
    title: "روی دستگاه مشترک، تیک نزنید",
    text: "در دستگاه عمومی یا امانی «مرا به خاطر بسپار» را خالی بگذارید تا با یک رفرش از حساب خارج شوید.",
  },
  {
    icon: ShieldCheck,
    tone: "mint",
    title: "فهرست نشست‌ها را مرور کنید",
    text: "هر از گاهی سری به بخش نشست‌ها بزنید و اگر دستگاه ناشناسی دیدید، «خروج از دستگاه‌های دیگر» و تغییر رمز را انجام دهید.",
  },
  {
    icon: Clock,
    tone: "amber",
    title: "فایل‌های مهم را زود ذخیره کنید",
    text: "فایل‌ها فقط یک روز نگه‌داری می‌شوند. اگر فایلی برایتان مهم است، همان روز آن را دانلود کنید.",
  },
];

export function Tips() {
  return (
    <Section id="tips">
      <SectionHead
        icon={Lightbulb}
        kicker="توصیه‌های کاربردی"
        title="چند عادت کوچک برای گفتگوهای امن‌تر"
        lead="این توصیه‌ها از امکانات موجود در خود پاندا چت استفاده می‌کنند و رعایت‌شان فقط چند ثانیه وقت می‌گیرد."
      />
      <ol className="mt-10 grid gap-3 sm:grid-cols-2">
        {tips.map((t, i) => (
          <li key={t.title} className="card relative flex gap-4 p-5">
            <IconTile icon={t.icon} tone={t.tone} className="size-10 rounded-xl" />
            <div className="min-w-0">
              <h3 className="pe-6 font-extrabold text-ink">{t.title}</h3>
              <p className="mt-1.5 text-sm leading-7 text-muted">{t.text}</p>
            </div>
            <span className="absolute end-4 top-4 text-xs font-extrabold text-faint">{toFa(i + 1)}</span>
          </li>
        ))}
      </ol>
    </Section>
  );
}

/* ───────────────────────── FAQ ───────────────────────── */
const faqs: { q: string; a: ReactNode }[] = [
  {
    q: "آیا مهمان‌ها برای ورود به اتاق به حساب کاربری نیاز دارند؟",
    a: "خیر. مهمان با باز کردن لینک دعوت، وارد کردن رمز (اگر اتاق رمزدار باشد) و انتخاب یک نام مستعار وارد اتاق می‌شود. حساب کاربری فقط برای ساختن و مدیریت اتاق‌ها و شروع گفتگوی خصوصی لازم است.",
  },
  {
    q: "لینک دعوت به دست فرد اشتباهی افتاده؛ چه کنم؟",
    a: "از زبانه «مدیریت ← اشتراک» گزینه «ساخت لینک جدید» را بزنید (یا در تلگرام ‎/newlink‎ را بفرستید). لینک قبلی همان لحظه از کار می‌افتد. اگر آن فرد وارد اتاق هم شده، از زبانه «اعضا» او را حذف کنید و در صورت داشتن رمز، رمز اتاق را هم عوض کنید.",
  },
  {
    q: "چرا با رفرش صفحه از حساب خارج شدم؟",
    a: "چون هنگام ورود گزینه «مرا به خاطر بسپار» را تیک نزده بودید. در این حالت نشست فقط تا رفرش بعدی باقی می‌ماند. روی دستگاه شخصی، هنگام ورود این گزینه را تیک بزنید.",
  },
  {
    q: "چرا نمی‌توانم در اتاق پیام بفرستم؟",
    a: "احتمالاً مالک اتاق را قفل کرده است. در اتاق قفل، اعضا پیام‌ها را می‌خوانند اما فقط مالک می‌تواند پیام بفرستد و این موضوع در کادر نوشتن پیام هم نمایش داده می‌شود.",
  },
  {
    q: "پیام «دسترسی تغییر کرد» یعنی چه؟",
    a: "یعنی وضعیت دسترسی شما به اتاق عوض شده است: ممکن است رمز اتاق تغییر کرده باشد (رمز جدید را وارد کنید)، از اتاق حذف شده باشید، اتاق حذف یا توسط مدیر غیرفعال شده باشد، یا نشست شما به پایان رسیده باشد (دوباره وارد شوید). متن همان پیام، علت دقیق را می‌گوید.",
  },
  {
    q: "فایلی که فرستاده بودم دیگر باز نمی‌شود.",
    a: "فایل‌ها فقط یک روز نگه‌داری می‌شوند و پس از آن با عبارت «فایل منقضی شد» نمایش داده می‌شوند. اگر هنوز به آن نیاز دارید، دوباره ارسالش کنید.",
  },
  {
    q: "عضوی را اشتباهی حذف کردم؛ می‌تواند برگردد؟",
    a: "بله. در زبانه «اعضا»، کنار اعضای حذف‌شده گزینه «اجازه بازگشت» را بزنید. بعد از آن، او می‌تواند دوباره با لینک دعوت وارد شود.",
  },
  {
    q: "چرا نمی‌توانم ربات تلگرام را وصل کنم؟",
    a: "چند حالت ممکن است: یکپارچگی تلگرام در حال حاضر توسط مدیر غیرفعال شده باشد، دسترسی به ربات ویژه حساب‌های پولی باشد و برای حساب شما فعال نشده باشد، یا کد اتصال منقضی شده باشد (کدها ۱۵ دقیقه اعتبار دارند). پیام نمایش‌داده‌شده در «حساب کاربری ← تلگرام» علت را مشخص می‌کند.",
  },
  {
    q: "«پاک کردن تاریخچه» با «حذف اتاق» چه فرقی دارد؟",
    a: "پاک کردن تاریخچه فقط همه پیام‌های اتاق را برای همه حذف می‌کند و خود اتاق باقی می‌ماند. حذف اتاق، اتاق را همراه با پیام‌ها، اعضا و اتصال ربات آن برای همیشه پاک می‌کند. هر دو برگشت‌ناپذیرند.",
  },
  {
    q: "نمی‌توانم اتاق جدید بسازم.",
    a: "احتمالاً به سقف تعداد اتاق‌های حساب خود رسیده‌اید؛ میزان استفاده را در داشبورد ببینید. می‌توانید اتاقی را که دیگر لازم ندارید حذف کنید یا برای افزایش سقف با مدیر پلتفرم هماهنگ کنید.",
  },
  {
    q: "با حذف حساب، چه چیزهایی پاک می‌شود؟",
    a: "حساب شما همراه با همه اتاق‌هایی که ساخته‌اید، پیام‌های آن‌ها و اتصال‌های ربات تلگرام برای همیشه حذف می‌شود. برای جلوگیری از اشتباه، تأیید با رمز عبور لازم است.",
  },
  {
    q: "پیام «پاندا چت در حال به‌روزرسانی است» را می‌بینم.",
    a: "پلتفرم موقتاً در حالت به‌روزرسانی قرار گرفته و ورود، داشبورد و اتاق‌ها برای مدت کوتاهی در دسترس نیستند. کمی بعد دوباره سر بزنید؛ اطلاعات شما سر جایش باقی می‌ماند.",
  },
];

function FaqItem({
  q,
  a,
  open,
  onToggle,
  index,
}: {
  q: string;
  a: ReactNode;
  open: boolean;
  onToggle: () => void;
  index: number;
}) {
  const id = `faq-${index}`;
  return (
    <div
      className={cn("rounded-2xl border bg-surface transition", open ? "border-line-strong shadow-card" : "border-line shadow-soft")}
    >
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={id}
          onClick={onToggle}
          className="flex w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-start"
        >
          <span className="text-[0.95rem] font-extrabold leading-7 text-ink">{q}</span>
          <span
            className={cn(
              "grid size-7 shrink-0 place-items-center rounded-lg transition",
              open ? "rotate-180 bg-accent-soft text-accent-ink" : "bg-surface-3 text-muted",
            )}
          >
            <ChevronDown className="size-4" aria-hidden="true" />
          </span>
        </button>
      </h3>
      <div
        id={id}
        role="region"
        className={cn("grid transition-[grid-template-rows] duration-300 ease-out", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}
      >
        <div className="overflow-hidden">
          <p className="px-5 pb-5 text-sm leading-8 text-muted">{a}</p>
        </div>
      </div>
    </div>
  );
}

export function Faq() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <Section id="faq">
      <SectionHead
        icon={CircleHelp}
        kicker="پرسش‌های پرتکرار"
        title="پاسخ پرسش‌هایی که معمولاً پیش می‌آید"
        lead="اگر جایی از کار با پاندا چت برایتان سؤال شده، احتمالاً پاسخش این‌جاست."
      />
      <div className="mt-10 space-y-2.5">
        {faqs.map((f, i) => (
          <FaqItem key={f.q} index={i} q={f.q} a={f.a} open={open === i} onToggle={() => setOpen(open === i ? null : i)} />
        ))}
      </div>
    </Section>
  );
}
