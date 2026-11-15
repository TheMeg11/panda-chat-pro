import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "@fontsource-variable/nunito";
import "@fontsource-variable/vazirmatn";
import "./globals.css";
import { I18nProvider } from "@/components/i18n-provider";
import { ServiceWorkerRegister } from "@/components/pwa";
import { getI18n } from "@/lib/i18n-server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return {
    title: { default: t.meta.title, template: `%s · Panda Chat` },
    description: t.meta.description,
    applicationName: "Panda Chat",
    manifest: "/manifest.webmanifest",
    icons: {
      icon: [
        { url: "/icons/icon-32.png", sizes: "32x32", type: "image/png" },
        { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
      apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    },
    appleWebApp: {
      capable: true,
      title: "Panda Chat",
      statusBarStyle: "default",
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8fc" },
    { media: "(prefers-color-scheme: dark)", color: "#12141c" },
  ],
};

// Applies the saved (or system) theme before first paint — avoids a flash of the wrong theme.
const themeScript = `(function(){try{var s=localStorage.getItem('pc-theme');var d=s?s==='dark':window.matchMedia('(prefers-color-scheme: dark)').matches;var e=document.documentElement;if(d){e.classList.add('dark')}e.style.colorScheme=d?'dark':'light'}catch(_){}})();`;

/**
 * v1.5.3 stale-chunk recovery: after a redeploy, a long-lived client (open tab,
 * installed PWA) fails its NEXT lazy-chunk import — the first sign is usually a
 * dead click on a menu item and then an error page "on every screen". The
 * boundaries (error.tsx / global-error.tsx) catch render crashes; this handler
 * catches the unhandled rejection route (prefetch/module fetch failures) and
 * performs a single full reload that heals the session.
 */
const chunkRecoveryScript = `(function(){
  var re=/Failed to fetch dynamically imported module|error loading dynamically imported module|Loading chunk \\d+|ChunkLoadError|Importing a module script failed|dynamically imported module/i;
  function recover(){try{var k='pc-chunk-recovery';var last=Number(sessionStorage.getItem(k)||0);if(Date.now()-last<20000)return;sessionStorage.setItem(k,String(Date.now()))}catch(_){}window.location.reload()}
  window.addEventListener('unhandledrejection',function(ev){var m=ev&&(ev.reason&&(ev.reason.message||ev.reason)||'');if(typeof m==='string'&&re.test(m))recover()});
  window.addEventListener('error',function(ev){var m=ev&&(ev.message||'');if(typeof m==='string'&&re.test(m))recover()});
})();`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  const { lang, dir } = await getI18n();
  return (
    <html lang={lang} dir={dir} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <script dangerouslySetInnerHTML={{ __html: chunkRecoveryScript }} />
      </head>
      <body className="min-h-dvh bg-canvas text-ink antialiased">
        <I18nProvider lang={lang}>{children}</I18nProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
