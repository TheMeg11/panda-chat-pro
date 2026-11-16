import type { Metadata } from "next";
import { LogOut } from "lucide-react";
import { logoutAction } from "@/app/actions/auth";
import { updateProfileAction } from "@/app/actions/account";
import { Avatar } from "@/components/brand";
import { AvatarForm } from "@/components/dashboard/avatar-form";
import { ActionForm, LocalTime, SubmitButton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getI18n } from "@/lib/i18n-server";
import { fmt } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.common.profile };
}

/**
 * v2.0 — the Profile tab (theme's ProfilePage): a big gradient-header card
 * with the avatar + display-name/bio form, and a plain identity card.
 *
 * PRIVACY: no conversation counters of any kind (they could leak how many
 * chats are hidden behind the vault) — only the username and member-since
 * date are shown.
 */
export default async function ProfilePage() {
  const user = await requireUser();
  const { t } = await getI18n();
  const [sinceBefore, sinceAfter = ""] = t.account.memberSince.split("{date}");

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 pb-24 sm:px-6 sm:py-10 md:pb-10">
      <div className="fade-up">
        <h1 className="text-3xl font-extrabold text-ink">{t.common.profile}</h1>
        <p className="mt-2 text-muted">{t.account.profileText}</p>
      </div>

      <div className="mt-6 space-y-5">
        {/* identity card with gradient header (theme style) */}
        <div className="card overflow-hidden">
          <div className="h-24 bg-gradient-to-r from-[#4a2be8] to-[#7d66ff] md:h-28" aria-hidden="true" />
          <div className="px-5 pb-6">
            <div className="-mt-12 flex items-end gap-4">
              <div className="relative shrink-0">
                <Avatar
                  name={user.displayName}
                  size={96}
                  src={user.avatarVersion > 0 ? `/api/users/${user.id}/avatar?v=${user.avatarVersion}` : undefined}
                  className="ring-4 ring-surface"
                />
              </div>
              <div className="min-w-0 pb-1">
                <p className="truncate text-xl font-extrabold text-ink" dir="auto">
                  {user.displayName}
                </p>
                <p className="text-sm text-muted" dir="ltr">
                  @{user.username}
                </p>
              </div>
            </div>
            {user.bio ? (
              <p className="mt-4 text-sm leading-relaxed text-ink-2" dir="auto">
                {user.bio}
              </p>
            ) : null}
            <p className="mt-3 text-xs text-faint">
              {sinceBefore}
              <LocalTime iso={user.createdAt.toISOString()} mode="date" />
              {sinceAfter}
            </p>
          </div>
        </div>

        {/* avatar + name + bio editor (same actions as the settings page) */}
        <div className="card p-5 sm:p-6">
          <h2 className="flex items-center gap-2 font-extrabold text-ink">{t.account.profile}</h2>
          <div className="mt-4">
            <AvatarForm userId={user.id} displayName={user.displayName} avatarVersion={user.avatarVersion} />
          </div>
          <ActionForm action={updateProfileAction} className="mt-4 space-y-3">
            <div>
              <label className="label" htmlFor="displayName">
                {t.auth.displayName}
              </label>
              <input id="displayName" name="displayName" className="input" defaultValue={user.displayName} required maxLength={40} dir="auto" />
            </div>
            <div>
              <label className="label" htmlFor="bio">
                {t.account.bio}
              </label>
              <textarea id="bio" name="bio" className="input" defaultValue={user.bio ?? ""} maxLength={280} rows={3} dir="auto" />
              <p className="mt-1 text-xs text-faint">{t.account.bioHint}</p>
            </div>
            <SubmitButton className="btn btn-primary btn-sm">{t.common.save}</SubmitButton>
          </ActionForm>
        </div>

        {/* sign out */}
        <form action={logoutAction} className="card flex items-center justify-between gap-3 p-5 sm:p-6">
          <div>
            <p className="text-sm font-bold text-ink">{t.common.logout}</p>
            <p className="mt-0.5 text-xs text-muted">{fmt(t.account.subtitle, {})}</p>
          </div>
          <SubmitButton className="btn btn-danger btn-sm">
            <LogOut className="size-4 rtl:-scale-x-100" />
            {t.common.logout}
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}
