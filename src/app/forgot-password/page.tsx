import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { ForgotPasswordForm } from "@/components/auth-forms";
import { getI18n } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

/**
 * Pre-login page: password recovery via the linked official Telegram bot.
 * No session required — and no session leak either: the answer is always the
 * same generic message regardless of whether the account exists.
 */
export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.auth.resetTitle };
}

export default async function ForgotPasswordPage() {
  const { t } = await getI18n();
  return (
    <AuthShell title={t.auth.resetTitle} subtitle={t.auth.resetSubtitle}>
      <ForgotPasswordForm />
    </AuthShell>
  );
}
