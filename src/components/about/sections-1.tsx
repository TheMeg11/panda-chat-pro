"use client";

import { useState } from "react";
import { Crown, KeyRound, Layers, Sparkles, Users } from "lucide-react";
import { Section, SectionHead, Steps } from "./ui";

/* ───────────────────────── Getting started ───────────────────────── */
const ownerSteps = [
  {
    title: "اتاق بسازید",
    text: "در داشبورد «اتاق جدید» را بزنید و نام اتاق را بنویسید. توضیحات و رمز اختیاری‌اند و همه‌چیز بعداً قابل تغییر است.",
  },
  {
    title: "لینک را بفرستید",
    text: "از زبانه «اشتراک»، لینک دعوت مخفی را کپی کنید و فقط برای افراد مورد اعتمادتان به‌صورت خصوصی بفرستید.",
  },
  {
    title: "گفتگو کنید",
    text: "در زبانه «گفتگو» پیام بنویسید، به پیام‌ها پاسخ دهید یا عکس، ویدیو و فایل بفرستید.",
  },
  {
    title: "از هر جا مدیریت کنید",
    text: "از زبانه «مدیریت» یا از ربات تلگرام، اعضا، رمز، قفل اتاق و لینک دعوت را کنترل کنید.",
  },
];

const guestSteps = [
  {
    title: "لینک دعوت را باز کنید",
    text: "اگر لینک عوض شده یا اتاق حذف شده باشد، پیام «این لینک دعوت معتبر نیست» نمایش داده می‌شود.",
  },
  {
    title: "رمز را وارد کنید",
    text: "فقط اگر اتاق رمزدار باشد. تا رمز روی سرور تأیید نشود، هیچ چیزی از اتاق نمایش داده نمی‌شود.",
  },
  {
    title: "نام مستعار انتخاب کنید",
    text: "نامی بین ۱ تا ۲۴ کاراکتر که دیگر اعضا شما را با آن می‌بینند؛ سپس «پیوستن به اتاق» را بزنید.",
  },
  {
    title: "به گفتگو بپیوندید",
    text: "حالا عضو اتاق هستید. اگر بعداً «خروج» را بزنید، برای بازگشت دوباره به لینک دعوت نیاز دارید.",
  },
];

export function GettingStarted() {
  const [mode, setMode] = useState<"owner" | "guest">("owner");

  return (
    <Section id="start">
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <SectionHead
          icon={Sparkles}
          kicker="شروع کار، قدم‌به‌قدم"
          title="از ایده تا یک گفتگوی خصوصی، در کمتر از یک دقیقه"
          lead="مسیر شما بسته به این‌که اتاق می‌سازید یا به اتاقی دعوت شده‌اید کمی فرق می‌کند. هر دو مسیر را این‌جا ببینید."
        />
        <div className="seg shrink-0 self-start md:self-auto" role="tablist" aria-label="نوع کاربر">
          <button
            type="button"
            role="tab"
            aria-selected={mode === "owner"}
            data-active={mode === "owner"}
            onClick={() => setMode("owner")}
            className="seg-item"
          >
            <Crown className="size-4" aria-hidden="true" />
            اتاق می‌سازم
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "guest"}
            data-active={mode === "guest"}
            onClick={() => setMode("guest")}
            className="seg-item"
          >
            <Users className="size-4" aria-hidden="true" />
            دعوت شده‌ام
          </button>
        </div>
      </div>

      <div key={mode} className="pop-in mt-14">
        <Steps steps={mode === "owner" ? ownerSteps : guestSteps} />
        <div className="mx-auto mt-12 max-w-3xl">
          {mode === "owner" ? (
            <p className="notice notice-accent">
              <Layers className="mt-1 size-4 shrink-0" aria-hidden="true" />
              <span>
                اتاق‌ها از هم مستقل‌اند: برای هر جمع یک اتاق جدا بسازید تا هر کدام لینک، رمز، اعضا و تنظیمات اعلان
                مخصوص خودش را داشته باشد. تعداد اتاق‌هایی که می‌توانید بسازید را مدیر پلتفرم تعیین می‌کند.
              </span>
            </p>
          ) : (
            <p className="notice notice-mint">
              <KeyRound className="mt-1 size-4 shrink-0" aria-hidden="true" />
              <span>
                اگر مالک اتاق رمز را تغییر دهد، برای ادامه گفتگو باید رمز جدید را وارد کنید. اگر مالک شما را از اتاق
                حذف کند، آن دعوت دیگر از همان دستگاه قابل استفاده نیست.
              </span>
            </p>
          )}
        </div>
      </div>
    </Section>
  );
}
