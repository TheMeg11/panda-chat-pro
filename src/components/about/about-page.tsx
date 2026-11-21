"use client";

import { BackToTop, MobileToc, Toc } from "./chrome";
import { GettingStarted } from "./sections-1";
import { Messaging, PrivateChats, Rooms } from "./sections-2";
import { Moderation, Telegram } from "./sections-3";
import { Account, AppAndLooks, Security } from "./sections-4";
import { Faq, Limits, Tips } from "./sections-5";
import { AboutFooter } from "./footer";
import { useI18n } from "@/components/i18n-provider";

/**
 * «درباره برنامه» — the in-app About page (client tree; the server page passes
 * owned rooms). v2.0: rendered INSIDE the dashboard shell (no own AppHeader —
 * the chat-list sidebar stays on md+), fully bilingual fa/en.
 */
export function AboutPage() {
  const { lang } = useI18n();
  const isFa = lang === "fa";
  return (
    <div className="min-h-dvh overflow-x-clip pb-24 md:pb-6">
      {/* compact page header */}
      <div className="mx-auto max-w-6xl px-5 pt-8 sm:pt-12">
        <div className="fade-up">
          <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface/80 px-3 py-1.5 text-xs font-bold text-ink-2 shadow-soft">
            <span className="live-dot" aria-hidden="true" />
            {isFa ? "درباره برنامه" : "About the app"}
          </span>
          <h1 className={`mt-5 text-[2rem] font-extrabold text-ink sm:text-[2.5rem] ${isFa ? "leading-[1.4]" : "leading-[1.15]"}`}>
            {isFa ? (
              <>
                پاندا چت؛ جایی آرام برای <span className="gradient-text">گفتگوهای خصوصی</span>
              </>
            ) : (
              <>
                Panda Chat — a calm home for <span className="gradient-text">private conversations</span>
              </>
            )}
          </h1>
          <p className={`mt-5 max-w-xl text-[1.02rem] text-muted sm:text-lg ${isFa ? "leading-8 sm:leading-9" : "leading-7 sm:leading-8"}`}>
            {isFa
              ? "پاندا چت یک پیام‌رسان تحت وب برای ساختن اتاق‌های گفتگوی خصوصی است. هر اتاق یک لینک دعوت طولانی و غیرقابل‌حدس دارد، در صورت تمایل با رمز محافظت می‌شود و از طریق ربات رسمی تلگرام هم قابل پیگیری و مدیریت است. در این صفحه همه امکانات، روش کار، تنظیمات، نکات امنیتی و محدودیت‌های سایت را یک‌جا توضیح داده‌ایم."
              : "Panda Chat is a web messenger for private chat rooms. Every room gets a long, unguessable invite link, an optional password, and can be managed from the official Telegram bot. This page gathers every feature, how-to, setting, security note and limit in one place."}
          </p>
        </div>
        <MobileToc />
      </div>

      <div className="mx-auto max-w-6xl px-5 lg:grid lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-12">
        <aside className="hidden lg:block">
          <Toc />
        </aside>

        {/* v2.5.0 (B-16): the section bodies are authored in Persian; give the
            content column the Persian direction + font when the UI is fa so
            headings, lists and FAQ boxes flow RTL instead of sitting LTR with
            Persian words. */}
        <main className="min-w-0" dir={isFa ? "rtl" : "ltr"} lang={isFa ? "fa" : "en"}>
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

      <AboutFooter />
      <BackToTop />
    </div>
  );
}
