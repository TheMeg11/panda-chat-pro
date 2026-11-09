import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DoorClosed } from "lucide-react";
import { AuthShell } from "@/components/auth-shell";
import { RegisterForm } from "@/components/auth-forms";
import { getCurrentUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n-server";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.common.signup };
}

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  const [{ t }, settings] = await Promise.all([getI18n(), getSettings()]);
  return (
    <AuthShell title={t.auth.registerTitle} subtitle={t.auth.registerSubtitle}>
      {settings.registrationOpen && !settings.maintenanceMode ? (
        <RegisterForm />
      ) : (
        <div className="card p-6 text-center">
          <span className="icon-tile mx-auto bg-amber-soft text-amber-ink">
            <DoorClosed className="size-5" />
          </span>
          <h2 className="mt-4 text-lg font-extrabold text-ink">
            {settings.maintenanceMode ? t.common.maintenanceTitle : t.auth.closedTitle}
          </h2>
          <p className="mt-2 text-sm text-muted">{settings.maintenanceMode ? t.common.maintenanceText : t.auth.closedText}</p>
          <Link href="/login" className="btn btn-secondary mt-6">
            {t.common.login}
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
