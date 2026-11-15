"use client";

import { AppHeader, BackToTop, MobileToc, Toc } from "./chrome";
import { GettingStarted } from "./sections-1";
import { Messaging, PrivateChats, Rooms } from "./sections-2";
import { Moderation, Telegram } from "./sections-3";
import { Account, AppAndLooks, Security } from "./sections-4";
import { Faq, Limits, Tips } from "./sections-5";
import { AboutFooter } from "./footer";
import type { RoomBrief } from "@/components/security/vault-dialog";

/** «درباره سایت» — the in-app About page (client tree; the server page passes owned rooms). */
export function AboutPage({ rooms }: { rooms: RoomBrief[] }) {
  return (
    <div className="min-h-dvh overflow-x-clip">
      <AppHeader />

      {/* compact page header */}
      <div className="mx-auto max-w-6xl px-5 pt-10 sm:pt-14">
        <div className="fade-up">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/80 px-3 py-1.5 text-xs font-bold text-ink-2 shadow-soft">
            <span className="live-dot" aria-hidden="true" />
            درباره سایت
          </span>
          <h1 className="mt-5 text-[2rem] font-extrabold leading-[1.4] text-ink sm:text-[2.5rem]">
            پاندا چت؛ جایی آرام برای <span className="gradient-text">گفتگوهای خصوصی</span>
          </h1>
          <p className="mt-5 max-w-xl text-[1.02rem] leading-8 text-muted sm:text-lg sm:leading-9">
            پاندا چت یک پیام‌رسان تحت وب برای ساختن اتاق‌های گفتگوی خصوصی است. هر اتاق یک لینک دعوت طولانی و
            غیرقابل‌حدس دارد، در صورت تمایل با رمز محافظت می‌شود و از طریق ربات رسمی تلگرام هم قابل پیگیری و مدیریت
            است. در این صفحه همه امکانات، روش کار، تنظیمات، نکات امنیتی و محدودیت‌های سایت را یک‌جا توضیح داده‌ایم.
          </p>
        </div>
        <MobileToc />
      </div>

      <div className="mx-auto max-w-6xl px-5 lg:grid lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-12">
        <aside className="hidden lg:block">
          <Toc />
        </aside>

        <main className="min-w-0">
          <GettingStarted />
          <Rooms />
          <Messaging />
          <PrivateChats />
          <Moderation />
          <Telegram />
          <Account />
          <Security />
          <AppAndLooks />
          <Limits />
          <Tips />
          <Faq />
        </main>
      </div>

      <AboutFooter rooms={rooms} />
      <BackToTop />
    </div>
  );
}
