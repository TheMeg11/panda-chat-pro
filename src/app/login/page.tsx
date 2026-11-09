import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/auth-forms";
import { getCurrentUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n-server";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.common.login };
}

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  const [{ t }, settings] = await Promise.all([getI18n(), getSettings()]);
  return (
    <AuthShell title={t.auth.loginTitle} subtitle={t.auth.loginSubtitle}>
      {settings.maintenanceMode ? <div className="notice notice-amber mb-6">{t.common.maintenanceText}</div> : null}
      <LoginForm />
    </AuthShell>
  );
}
