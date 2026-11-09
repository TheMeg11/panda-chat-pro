import { Globe, Megaphone, SlidersHorizontal } from "lucide-react";
import { adminAction } from "@/app/actions/admin";
import { PageHeader, Section } from "@/components/admin/parts";
import { ActionForm, SubmitButton } from "@/components/ui";
import { getAdminSession, isAdminSlug } from "@/lib/admin-auth";
import { getI18n } from "@/lib/i18n-server";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function AdminPlatform({ params }: { params: Promise<{ panel: string }> }) {
  const { panel } = await params;
  if (!isAdminSlug(panel) || !(await getAdminSession())) return null;
  const { t } = await getI18n();
  const s = await getSettings();
  const toggles: Array<[string, string, string, boolean]> = [
    ["registrationOpen", t.admin.registrationOpen, t.admin.registrationHint, s.registrationOpen],
    ["maintenanceMode", t.admin.maintenanceMode, t.admin.maintenanceHint, s.maintenanceMode],
  ];

  return (
    <>
      <PageHeader title={t.admin.platformTitle} subtitle={t.admin.platformSubtitle} />
      <ActionForm action={adminAction} className="space-y-6">
        <input type="hidden" name="op" value="settings.update" />
        <Section title={t.admin.navPlatform} icon={SlidersHorizontal}>
          <div className="divide-y divide-line">
            {toggles.map(([name, label, hint, checked]) => (
              <label key={name} className="flex cursor-pointer items-center justify-between gap-6 px-5 py-4">
                <span>
                  <span className="block text-sm font-bold text-ink">{label}</span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted">{hint}</span>
                </span>
                <input type="checkbox" name={name} className="switch" defaultChecked={checked} />
              </label>
            ))}
            <div className="grid gap-5 px-5 py-5 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="defaultMaxRooms">
                  {t.admin.defaultMaxRooms}
                </label>
                <input id="defaultMaxRooms" name="defaultMaxRooms" type="number" min={0} max={10000} className="input" defaultValue={s.defaultMaxRooms} required />
              </div>
              <div>
                <label className="label" htmlFor="maxMessageLength">
                  {t.admin.maxMessageLength}
                </label>
                <input id="maxMessageLength" name="maxMessageLength" type="number" min={50} max={10000} className="input" defaultValue={s.maxMessageLength} required />
              </div>
            </div>
          </div>
        </Section>
        <Section title={t.admin.announcement} icon={Megaphone} tone="bg-amber-soft text-amber-ink">
          <div className="p-5">
            <textarea name="announcement" className="input" rows={2} maxLength={280} defaultValue={s.announcement} dir="auto" />
            <p className="hint">{t.admin.announcementHint}</p>
          </div>
        </Section>
        <Section title={t.admin.publicUrl} icon={Globe} tone="bg-sky-soft text-sky-ink">
          <div className="p-5">
            <input name="publicUrl" type="url" className="input" defaultValue={s.publicUrl} placeholder="https://chat.example.com" dir="ltr" />
            <p className="hint">{t.admin.publicUrlHint}</p>
          </div>
        </Section>
        <SubmitButton className="btn btn-primary">{t.admin.saveSettings}</SubmitButton>
      </ActionForm>
    </>
  );
}
