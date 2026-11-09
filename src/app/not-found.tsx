import Link from "next/link";
import { PandaMark } from "@/components/brand";
import { getI18n } from "@/lib/i18n-server";

export default async function NotFound() {
  const { t } = await getI18n();
  return (
    <main className="relative grid min-h-dvh place-items-center overflow-hidden px-6">
      <div className="hero-glow pointer-events-none absolute inset-0" aria-hidden="true" />
      <div className="relative text-center fade-up">
        <PandaMark size={72} className="mx-auto mb-6 float-slow" />
        <p className="text-sm font-extrabold tracking-[0.2em] text-accent-ink">404</p>
        <h1 className="mt-2 text-3xl font-extrabold text-ink">{t.common.notFoundTitle}</h1>
        <p className="mx-auto mt-3 max-w-sm text-muted">{t.common.notFoundText}</p>
        <Link href="/" className="btn btn-primary btn-lg mt-8">
          {t.common.backHome}
        </Link>
      </div>
    </main>
  );
}
