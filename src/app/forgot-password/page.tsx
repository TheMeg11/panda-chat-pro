import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { ForgotPasswordForm } from "@/components/auth-forms";
import { getI18n } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

/**
 * Pre-login page: password recovery with a signup recovery code (web-only).
 * No session required — and no session leak either: a wrong code and an
 * unknown username produce the same generic error.
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
