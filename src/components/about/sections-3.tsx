"use client";

import type { ReactNode } from "react";
import {
  Eraser,
  KeyRound,
  Lock,
  LockOpen,
  Pencil,
  RefreshCw,
  Trash2,
  TriangleAlert,
  UserCheck,
  UserX,
  Wrench,
} from "lucide-react";
import { IconTile, Point, Section, SectionHead, SubHead, toFa, type Icon, type Tone } from "./ui";

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
    where: "روی خود پیام / دکمه «حذف»",
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
    effect: "اتاق، پیام‌ها و اعضای آن برای همیشه حذف می‌شود.",
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
        lead="ابزارهای مدیریتی فقط برای مالک اتاق و از زبانه «مدیریت» در وب در دسترس است. پیش از هر اقدام، بدانید دقیقاً چه اتفاقی می‌افتد:"
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

/* ─────────────────────────────────────────────────────────── */
