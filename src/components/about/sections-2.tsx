"use client";

import { useState, type ReactNode } from "react";
import {
  AtSign,
  Bell,
  Bot,
  Eye,
  EyeOff,
  History,
  Keyboard,
  Layers,
  MessagesSquare,
  Paperclip,
  Plus,
  Reply,
  Search,
  Settings,
  Share2,
  ShieldAlert,
  ShieldCheck,
  Tag,
  Trash2,
  Users,
  WifiOff,
} from "lucide-react";
import { CheckItem, FakeField, IconTile, Kbd, Point, Section, SectionHead, SubHead, type Icon, type Tone } from "./ui";

/* ───────────────────────── Rooms & dashboard ───────────────────────── */
const manageTabs: { id: string; label: string; icon: Icon; tone: Tone; title: string; items: string[] }[] = [
  {
    id: "share",
    label: "اشتراک",
    icon: Share2,
    tone: "accent",
    title: "لینک دعوت مخفی",
    items: [
      "نمایش لینک دعوت اتاق همراه با دکمه کپی؛ هر کس این لینک را داشته باشد می‌تواند وارد شود (پس از وارد کردن رمز، اگر تنظیم شده باشد).",
      "«ساخت لینک جدید»: لینک فعلی بلافاصله از کار می‌افتد و فقط لینک تازه برای ورود معتبر است.",
      "«باز کردن صفحه دعوت»: همان صفحه‌ای را که مهمان‌ها هنگام ورود می‌بینند، خودتان ببینید.",
    ],
  },
  {
    id: "security",
    label: "امنیت",
    icon: ShieldCheck,
    tone: "lavender",
    title: "رمز و قفل اتاق",
    items: [
      "تنظیم، تغییر یا حذف رمز اتاق. با تغییر رمز، همه — حتی اعضای فعلی — باید رمز جدید را وارد کنند.",
      "با حذف رمز، هر کسی که لینک را داشته باشد بدون رمز وارد می‌شود.",
      "قفل کردن اتاق: اعضا پیام‌ها را می‌خوانند اما فقط شما می‌توانید پیام بفرستید. «باز کردن قفل» همه‌چیز را به حالت عادی برمی‌گرداند.",
    ],
  },
  {
    id: "telegram",
    label: "تلگرام",
    icon: Bot,
    tone: "sky",
    title: "اعلان‌های این اتاق در تلگرام",
    items: [
      "وضعیت اعلان همین اتاق: روشن یا بی‌صدا. اتاق بی‌صدا دیگر به تلگرام شما ارسال نمی‌شود تا دوباره فعالش کنید.",
      "«ارسال پیام آزمایشی» برای اطمینان از این‌که اتصال تلگرام درست کار می‌کند.",
      "فهرست دستورهای ربات و راهنمای اتصال، اگر هنوز حساب خود را به تلگرام وصل نکرده باشید.",
    ],
  },
  {
    id: "members",
    label: "اعضا",
    icon: Users,
    tone: "mint",
    title: "فهرست اعضا",
    items: [
      "همه اعضای اتاق با وضعیت «آنلاین» یا زمان «آخرین بازدید».",
      "«حذف» عضو: او از اتاق بیرون می‌رود و دیگر نمی‌تواند از همان دستگاه دوباره وارد شود.",
      "«اجازه بازگشت» برای اعضای حذف‌شده، اگر نظرتان عوض شد.",
    ],
  },
  {
    id: "settings",
    label: "تنظیمات",
    icon: Settings,
    tone: "amber",
    title: "مشخصات اتاق و منطقه خطر",
    items: [
      "ویرایش نام و توضیحات اتاق.",
      "«پاک کردن تاریخچه»: همه پیام‌های اتاق برای همه حذف می‌شود.",
      "«حذف اتاق»: اتاق، پیام‌ها، اعضا و اتصال ربات آن برای همیشه حذف می‌شود.",
    ],
  },
];

export function Rooms() {
  const [tab, setTab] = useState(manageTabs[0].id);
  const current = manageTabs.find((t) => t.id === tab) ?? manageTabs[0];

  return (
    <Section id="rooms">
      <SectionHead
        icon={Layers}
        kicker="اتاق‌ها و داشبورد"
        title="خانه شما در پاندا چت"
        lead="بعد از ورود، داشبورد اولین صفحه‌ای است که می‌بینید: فهرست اتاق‌ها و گفتگوهای خصوصی، آمار کلی، جستجو و دکمه ساخت اتاق جدید."
      />

      <div className="mt-10 grid items-start gap-8 lg:grid-cols-2">
        <ul className="space-y-4">
          <Point icon={Layers} tone="accent">
            <b className="text-ink">آمار کلی:</b> تعداد اتاق‌ها، مجموع اعضا و اتاق‌هایی که به تلگرام متصل‌اند.
          </Point>
          <Point icon={Plus} tone="lavender">
            <b className="text-ink">سهمیه اتاق:</b> عبارتی مثل «۲ از ۵ استفاده شده» نشان می‌دهد چند اتاق دیگر
            می‌توانید بسازید. سقف را مدیر پلتفرم تعیین می‌کند.
          </Point>
          <Point icon={Search} tone="sky">
            <b className="text-ink">جستجو:</b> میان گفتگوهایتان جستجو کنید، یا با نوشتن @نام‌کاربری دقیق، یک گفتگوی
            خصوصی تازه شروع کنید.
          </Point>
          <Point icon={Tag} tone="mint">
            <b className="text-ink">برچسب‌های وضعیت:</b> روی هر اتاق «ربات»، «رمزدار»، «قفل» یا «غیرفعال» به همراه
            تعداد اعضا، تعداد پیام‌ها و زمان آخرین فعالیت دیده می‌شود.
          </Point>
          <Point icon={Bell} tone="amber">
            <b className="text-ink">اطلاعیه‌ها:</b> اگر مدیر پلتفرم پیامی برای همه داشته باشد، به‌صورت بنر در
            داشبورد نمایش داده می‌شود.
          </Point>
        </ul>

        {/* Create room — mirrors the real form */}
        <div className="relative">
          <div
            className="absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-tr from-sky/50 via-accent-soft to-lavender/60 blur-2xl"
            aria-hidden="true"
          />
          <div className="overflow-hidden rounded-[1.4rem] border border-line bg-surface shadow-float">
            <div className="flex items-center justify-between gap-3 border-b border-line bg-surface-2 px-5 py-3.5">
              <p className="text-sm font-extrabold text-ink">ساخت اتاق خصوصی</p>
              <span className="badge badge-neutral">نمای نمونه</span>
            </div>
            <div className="space-y-4 p-5">
              <p className="text-sm text-muted">بعداً می‌توانید همه چیز را تغییر دهید.</p>
              <FakeField label="نام اتاق" placeholder="مثلاً برنامه آخر هفته" hint="۱ تا ۶۰ کاراکتر." />
              <FakeField label="توضیحات" placeholder="این اتاق درباره چیست؟" optional />
              <FakeField
                label="رمز اتاق"
                placeholder="برای اتاق بدون رمز خالی بگذارید"
                hint="بازدیدکنندگان باید پیش از دیدن هر چیزی آن را وارد کنند. حداقل ۴ کاراکتر."
                optional
              />
              <span className="btn btn-primary w-full" aria-hidden="true">
                ساخت اتاق
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Room anatomy */}
      <div className="mt-14">
        <SubHead>ساختار صفحه هر اتاق</SubHead>
        <p className="mt-2 max-w-2xl text-sm leading-7 text-muted">
          هر اتاق دو زبانه اصلی دارد: <b className="text-ink-2">«گفتگو»</b> برای پیام‌ها و{" "}
          <b className="text-ink-2">«مدیریت»</b> که فقط برای مالک نمایش داده می‌شود و پنج بخش دارد. روی هر بخش بزنید
          تا ببینید چه چیزهایی در آن است:
        </p>

        <div className="mt-6 overflow-x-auto no-scrollbar">
          <div className="seg" role="tablist" aria-label="بخش‌های زبانه مدیریت">
            {manageTabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                data-active={tab === t.id}
                onClick={() => setTab(t.id)}
                className="seg-item"
              >
                <t.icon className="size-4" aria-hidden="true" />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div key={current.id} className="pop-in card mt-4 flex flex-col gap-5 p-6 sm:flex-row sm:p-7">
          <IconTile icon={current.icon} tone={current.tone} />
          <div className="min-w-0">
            <h4 className="text-base font-extrabold text-ink">
              زبانه «{current.label}» — {current.title}
            </h4>
            <ul className="mt-3 space-y-1.5">
              {current.items.map((it) => (
                <CheckItem key={it}>{it}</CheckItem>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Section>
  );
}

/* ───────────────────────── Messaging ───────────────────────── */
const msgFeatures: { icon: Icon; tone: Tone; title: string; text: ReactNode }[] = [
  {
    icon: Reply,
    tone: "accent",
    title: "پاسخ به پیام",
    text: "روی هر پیام «پاسخ» بزنید؛ نقل‌قول کوتاهی از پیام اصلی بالای پاسخ شما قرار می‌گیرد تا رشته گفتگو گم نشود.",
  },
  {
    icon: Paperclip,
    tone: "lavender",
    title: "عکس، ویدیو و فایل",
    text: "با دکمه پیوست فایل بفرستید. فایل‌ها یک روز نگه‌داری می‌شوند و بعد از آن «منقضی» نمایش داده می‌شوند. حجم و نوع فایل محدودیت دارد.",
  },
  {
    icon: Trash2,
    tone: "rose",
    title: "حذف برای همه",
    text: "حذف یک پیام برای همه اعضا اعمال می‌شود و به جای آن عبارت «پیام حذف‌شده» می‌نشیند. مالک اتاق می‌تواند هر پیامی را حذف کند.",
  },
  {
    icon: Keyboard,
    tone: "sky",
    title: "نوشتن راحت",
    text: (
      <>
        <Kbd>Enter</Kbd> برای ارسال و <Kbd>Shift</Kbd>+<Kbd>Enter</Kbd> برای رفتن به خط جدید. نزدیک سقف طول پیام،
        تعداد کاراکترهای باقی‌مانده نمایش داده می‌شود.
      </>
    ),
  },
  {
    icon: History,
    tone: "mint",
    title: "رویدادهای اتاق",
    text: "پیوستن و ترک اعضا، حذف یک عضو، قفل یا باز شدن اتاق و پاک شدن تاریخچه به‌صورت پیام سیستمی در گفتگو ثبت می‌شود.",
  },
  {
    icon: Tag,
    tone: "amber",
    title: "نشانه‌های راهنما",
    text: "نشان «مالک»، برچسب «ارسال‌شده از تلگرام»، جداکننده «پیام‌های جدید» و تاریخ‌های «امروز» و «دیروز» خواندن گفتگو را ساده می‌کنند.",
  },
  {
    icon: WifiOff,
    tone: "sky",
    title: "اتصال لحظه‌ای",
    text: "پیام‌ها و وضعیت آنلاین اعضا بدون رفرش به‌روز می‌شوند. اگر اینترنت قطع شود «در حال اتصال دوباره…» نمایش داده می‌شود.",
  },
  {
    icon: ShieldAlert,
    tone: "rose",
    title: "تغییر دسترسی",
    text: "اگر رمز اتاق عوض شود، از اتاق حذف شوید، اتاق غیرفعال شود یا نشست شما تمام شود، پیام «دسترسی تغییر کرد» قدم بعدی را می‌گوید.",
  },
];

export function Messaging() {
  return (
    <Section id="messaging">
      <SectionHead
        icon={MessagesSquare}
        kicker="گفتگو و پیام‌ها"
        title="همه آنچه در زبانه «گفتگو» دارید"
        lead="گفتگو در پاندا چت لحظه‌ای است: پیام‌ها بدون نیاز به رفرش می‌رسند و وضعیت آنلاین اعضا همیشه پیداست. امکانات زیر هم در اتاق‌ها در دسترس است."
      />
      <div className="mt-10 grid gap-3 sm:grid-cols-2">
        {msgFeatures.map((f) => (
          <div key={f.title} className="flex gap-3.5 rounded-2xl border border-line bg-surface p-4 shadow-soft">
            <IconTile icon={f.icon} tone={f.tone} className="size-10 rounded-xl" />
            <div className="min-w-0">
              <h4 className="text-[0.95rem] font-extrabold text-ink">{f.title}</h4>
              <p className="mt-1 text-[0.84rem] leading-7 text-muted">{f.text}</p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ───────────────────────── Private chats & hidden chats ───────────────────────── */
export function PrivateChats() {
  return (
    <Section id="private">
      <SectionHead
        icon={AtSign}
        kicker="گفتگوی خصوصی و چت مخفی"
        title="گفتگوی دونفره، و راهی برای پنهان کردن آن"
        lead="علاوه بر اتاق‌ها، می‌توانید با هر کاربر دیگری گفتگوی خصوصی داشته باشید و روی دستگاه‌های مشترک، گفتگوهای دلخواه را از فهرست پنهان کنید."
      />

      <div className="mt-10 grid gap-5 lg:grid-cols-2">
        {/* DM */}
        <div className="card p-6 sm:p-7">
          <div className="flex items-center gap-3">
            <IconTile icon={AtSign} tone="accent" />
            <h3 className="text-lg font-extrabold text-ink">شروع گفتگوی خصوصی</h3>
          </div>
          <ol className="mt-6 space-y-4">
            {[
              <>در کادر جستجوی داشبورد، نام کاربری <b className="text-ink">دقیق</b> طرف مقابل را بنویسید (مثلاً ‎@sara.k‎).</>,
              <>گزینه «جستجوی دقیق نام کاربری» را بزنید؛ اگر کاربر فعالی با این نام وجود داشته باشد، نمایش داده می‌شود.</>,
              <>«شروع گفتگو» را بزنید. گفتگو در فهرست شما و طرف مقابل ظاهر می‌شود.</>,
            ].map((step, i) => (
              <li key={i} className="flex gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-accent to-accent-2 text-xs font-extrabold text-on-accent">
                  {["۱", "۲", "۳"][i]}
                </span>
                <p className="text-sm leading-7 text-ink-2">{step}</p>
              </li>
            ))}
          </ol>
          <ul className="mt-6 space-y-1.5 border-t border-line pt-5">
            <CheckItem>هیچ فهرست عمومی از کاربران وجود ندارد؛ بدون دانستن نام کاربری دقیق، کسی پیدا نمی‌شود.</CheckItem>
            <CheckItem>با خودتان نمی‌توانید گفتگو بسازید و تعداد گفتگوهای خصوصی سقف مشخصی دارد.</CheckItem>
            <CheckItem tone="rose">
              «حذف گفتگو» آن را همراه همه پیام‌هایش برای <b>هر دو طرف</b> و برای همیشه پاک می‌کند.
            </CheckItem>
          </ul>
        </div>

        {/* Hidden chats */}
        <div className="card p-6 sm:p-7">
          <div className="flex items-center gap-3">
            <IconTile icon={EyeOff} tone="lavender" />
            <h3 className="text-lg font-extrabold text-ink">چت‌های مخفی روی دستگاه</h3>
          </div>
          <p className="mt-5 text-sm leading-7 text-ink-2">
            با «مخفی‌کردن گفتگو»، آن گفتگو از فهرست شما <b className="text-ink">فقط روی همین دستگاه</b> برداشته
            می‌شود. بار اول یک رمز مخفی (حداقل ۴ کاراکتر) انتخاب می‌کنید و از آن به بعد فهرست «چت‌های مخفی» فقط با
            همین رمز باز می‌شود. از همان فهرست می‌توانید هر گفتگو را با «نمایش مجدد» برگردانید.
          </p>
          <ul className="mt-5 space-y-1.5">
            <CheckItem>رمز چت‌های مخفی روی همین دستگاه ذخیره می‌شود و به سرور ارسال نمی‌شود.</CheckItem>
            <CheckItem>روی دستگاه‌های دیگر، همان گفتگو مثل همیشه در فهرست دیده می‌شود.</CheckItem>
            <CheckItem>
              <a href="#version" style={{ color: "inherit", textDecoration: "none", cursor: "default" }} aria-hidden={false}>
                راه باز کردن فهرست چت‌های مخفی
              </a>{" "}
              هنگام مخفی‌کردن به شما نشان داده می‌شود و عمداً این‌جا تکرار نشده تا مخفی بماند.
            </CheckItem>
          </ul>

          <div className="mt-6 grid grid-cols-2 gap-3 border-t border-line pt-5 text-sm">
            <div className="rounded-xl bg-lavender-soft p-3.5">
              <p className="flex items-center gap-1.5 font-extrabold text-accent-ink">
                <Eye className="size-4" aria-hidden="true" /> مخفی‌کردن
              </p>
              <p className="mt-1.5 text-xs leading-6 text-ink-2">فقط روی این دستگاه، برگشت‌پذیر، پیام‌ها دست‌نخورده.</p>
            </div>
            <div className="rounded-xl bg-rose-soft p-3.5">
              <p className="flex items-center gap-1.5 font-extrabold text-rose-ink">
                <Trash2 className="size-4" aria-hidden="true" /> حذف گفتگو
              </p>
              <p className="mt-1.5 text-xs leading-6 text-ink-2">برای هر دو طرف، همیشگی، پیام‌ها پاک می‌شوند.</p>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}
