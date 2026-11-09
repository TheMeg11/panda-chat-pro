import type { Metadata } from "next";
import { KeyRound, Laptop, LogOut, Smartphone, TriangleAlert, UserRound, X } from "lucide-react";
import { and, desc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { rooms, sessions } from "@/db/schema";
import { changePasswordAction, deleteAccountAction, revokeSessionAction, signOutOthersAction, updateProfileAction } from "@/app/actions/account";
import { Avatar } from "@/components/brand";
import { InstallAppCard } from "@/components/pwa";
import { VersionTap } from "@/components/privacy";
import { AvatarForm } from "@/components/dashboard/avatar-form";
import { NotificationsCard } from "@/components/dashboard/notifications-card";
import { TelegramCard } from "@/components/dashboard/telegram-card";
import { ReplayTutorialButton } from "@/components/tutorial/tutorial-gate";
import { TwoFactorCard } from "@/components/security/twofactor-card";
import { SecurityCard } from "@/components/security/security-card";
import { ActionForm, LocalTime, PasswordInput, SubmitButton } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { formatNumber } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n-server";
import { getSettings } from "@/lib/settings";
import { getPlatformBot } from "@/lib/telegram/platform";
import { BOT_COMMANDS, linkForUser } from "@/lib/telegram/service";
import { is2faEnabled } from "@/lib/twofactor";
import { fmt } from "@/lib/utils";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.account.title };
}

function describeAgent(ua: string | null) {
  if (!ua) return { label: "Unknown device", mobile: false };
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Browser";
  const os = /iPhone|iPad/.test(ua)
    ? "iOS"
    : /Android/.test(ua)
      ? "Android"
      : /Mac OS X/.test(ua)
        ? "macOS"
        : /Windows/.test(ua)
          ? "Windows"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return { label: os ? `${browser} · ${os}` : browser, mobile: /Mobile|Android|iPhone/.test(ua) };
}

export default async function AccountPage() {
  const user = await requireUser();
  const { t, lang } = await getI18n();
  const [list, ownedRooms, settings, link, bot, twofa] = await Promise.all([
    db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, user.id), gt(sessions.expiresAt, new Date())))
      .orderBy(desc(sessions.lastSeenAt)),
    db.select({ id: rooms.id, name: rooms.name }).from(rooms).where(eq(rooms.ownerId, user.id)),
    getSettings(),
    linkForUser(user.id),
    getPlatformBot(),
    is2faEnabled(user.id),
  ]);

  let mutedRooms: Array<{ id: string; name: string }> = [];
  if (link && link.mutedRooms.length > 0) {
    const rows = await db
      .select({ id: rooms.id, name: rooms.name })
      .from(rooms)
      .where(eq(rooms.ownerId, user.id));
    mutedRooms = rows.filter((r) => link.mutedRooms.includes(r.id));
  }
  const [sinceBefore, sinceAfter = ""] = t.account.memberSince.split("{date}");

  const anchors = [
    { href: "#account", label: t.common.account },
    { href: "#notifications", label: t.common.notifications },
    { href: "#security", label: t.common.security },
    { href: "#telegram", label: t.common.telegramBotSettings },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <div className="fade-up">
        <h1 className="text-3xl font-extrabold text-ink">{t.account.title}</h1>
        <p className="mt-2 text-muted">{t.account.subtitle}</p>
      </div>

      {/* Sticky anchor nav: jumps between the four settings sections. */}
      <nav aria-label={t.common.account} className="sticky top-0 z-20 -mx-1 mb-4 flex flex-wrap gap-1.5 border-b border-line bg-canvas/95 py-2 backdrop-blur">
        {anchors.map((a) => (
          <a
            key={a.href}
            href={a.href}
            className="rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-xs font-bold text-ink-2 hover:border-line-strong hover:text-ink"
          >
            {a.label}
          </a>
        ))}
      </nav>

      <div className="space-y-5">
        {/* ---------------------------------------------------------- */}
        {/* Account: profile (avatar + name + bio), tutorial, danger zone */}
        {/* ---------------------------------------------------------- */}
        <section id="account" className="scroll-mt-20 space-y-5">
          <div className="card p-5 sm:p-6">
            <div className="flex items-center gap-4">
              <Avatar
                name={user.displayName}
                size={56}
                src={user.avatarVersion > 0 ? `/api/users/${user.id}/avatar?v=${user.avatarVersion}` : undefined}
              />
              <div className="min-w-0">
                <p className="truncate text-lg font-extrabold text-ink">{user.displayName}</p>
                <p className="text-sm text-muted" dir="ltr">
                  @{user.username}
                </p>
                <p className="mt-0.5 text-xs text-faint">
                  {sinceBefore}
                  <LocalTime iso={user.createdAt.toISOString()} mode="date" />
                  {sinceAfter}
                </p>
              </div>
            </div>
            <div className="mt-6 border-t border-line pt-5">
              <h2 className="flex items-center gap-2 font-extrabold text-ink">
                <UserRound className="size-4 text-accent-ink" />
                {t.account.profile}
              </h2>
              <p className="mt-1 text-sm text-muted">{t.account.profileText}</p>
              <div className="mt-4">
                <AvatarForm userId={user.id} displayName={user.displayName} avatarVersion={user.avatarVersion} />
              </div>
              <ActionForm action={updateProfileAction} className="mt-4 space-y-3">
                <div>
                  <label className="label" htmlFor="displayName">
                    {t.auth.displayName}
                  </label>
                  <input
                    id="displayName"
                    name="displayName"
                    className="input"
                    defaultValue={user.displayName}
                    required
                    maxLength={40}
                    dir="auto"
                  />
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
          </div>

          <div className="card flex flex-wrap items-center justify-between gap-3 p-5 sm:p-6">
            <div>
              <p className="text-sm font-bold text-ink">{t.tutorial.restart}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted">{t.tutorial.restartHint}</p>
            </div>
            <ReplayTutorialButton />
          </div>

          <section className="card border-rose/70 p-5 sm:p-6">
            <h2 className="flex items-center gap-2 font-extrabold text-rose-ink">
              <TriangleAlert className="size-4" />
              {t.account.dangerTitle}
            </h2>
            <p className="mt-1 text-sm text-muted">{t.account.dangerText}</p>
            <ActionForm action={deleteAccountAction} confirm={t.account.deleteConfirm} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="sm:flex-1">
                <label className="label" htmlFor="delete-password">
                  {t.account.confirmWithPassword}
                </label>
                <PasswordInput id="delete-password" name="password" autoComplete="current-password" />
              </div>
              <SubmitButton className="btn btn-danger h-11">{t.account.deleteAccount}</SubmitButton>
            </ActionForm>
          </section>
        </section>

        {/* ---------------------------------------------------------- */}
        {/* Notifications: device-local browser notification preferences */}
        {/* ---------------------------------------------------------- */}
        <section id="notifications" className="scroll-mt-20">
          <NotificationsCard />
        </section>

        {/* ---------------------------------------------------------- */}
        {/* Security: password, sessions, 2FA, privacy toolbox           */}
        {/* ---------------------------------------------------------- */}
        <section id="security" className="scroll-mt-20 space-y-5">
          <section className="card p-5 sm:p-6">
            <h2 className="flex items-center gap-2 font-extrabold text-ink">
              <KeyRound className="size-4 text-accent-ink" />
              {t.account.passwordTitle}
            </h2>
            <ActionForm action={changePasswordAction} resetOnSuccess className="mt-4 space-y-4">
              <div>
                <label className="label" htmlFor="current">
                  {t.account.currentPassword}
                </label>
                <PasswordInput name="current" autoComplete="current-password" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="password">
                    {t.account.newPassword}
                  </label>
                  <PasswordInput name="password" autoComplete="new-password" minLength={8} />
                </div>
                <div>
                  <label className="label" htmlFor="confirm">
                    {t.account.confirmPassword}
                  </label>
                  <PasswordInput name="confirm" autoComplete="new-password" minLength={8} />
                </div>
              </div>
              <SubmitButton className="btn btn-primary btn-sm">{t.account.changePassword}</SubmitButton>
            </ActionForm>
          </section>

          <section className="card p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 font-extrabold text-ink">
                  <Laptop className="size-4 text-accent-ink" />
                  {t.account.sessionsTitle}
                </h2>
                <p className="mt-1 text-sm text-muted">{fmt(t.account.sessionsText, { n: formatNumber(list.length, lang) })}</p>
              </div>
              {list.length > 1 ? (
                <ActionForm action={signOutOthersAction} showMessage={false}>
                  <SubmitButton className="btn btn-secondary btn-sm">
                    <LogOut className="size-4 rtl:-scale-x-100" />
                    {t.account.signOutOthers}
                  </SubmitButton>
                </ActionForm>
              ) : null}
            </div>
            <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
              {list.map((s) => {
                const agent = describeAgent(s.userAgent);
                const Icon = agent.mobile ? Smartphone : Laptop;
                return (
                  <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-3 text-muted">
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-ink" dir="ltr">
                        {agent.label}
                      </p>
                      <p className="text-xs text-muted">
                        <LocalTime iso={s.lastSeenAt.toISOString()} mode="relative" />
                        {s.ip ? (
                          <span dir="ltr">
                            {" · "}
                            {s.ip}
                          </span>
                        ) : null}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {s.id === user.sessionId ? <span className="badge badge-mint">{t.account.thisDevice}</span> : null}
                      <span className="badge badge-neutral">{s.persistent ? t.account.remembered : t.account.untilRefresh}</span>
                      {s.id !== user.sessionId ? (
                        <ActionForm action={revokeSessionAction} showMessage={false}>
                          <input type="hidden" name="sessionId" value={s.id} />
                          <SubmitButton className="btn btn-ghost btn-sm" title={t.security.revokeSession}>
                            <X className="size-3.5" />
                            {t.security.revokeSession}
                          </SubmitButton>
                        </ActionForm>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-faint">{t.account.sessionsNote}</p>
          </section>

          <TwoFactorCard enabled={twofa} />

          <SecurityCard />
        </section>

        {/* ---------------------------------------------------------- */}
        {/* Telegram: bot link, forwarding, offline notify, bot DMs      */}
        {/* (the card itself is <section id="telegram"> + scroll-mt-20) */}
        {/* ---------------------------------------------------------- */}
        <TelegramCard
          telegramEnabled={settings.telegramEnabled}
          paid={settings.telegramPaid}
          allowed={user.canUseTelegram}
          botUsername={bot.botUsername}
          link={
            link
              ? {
                  chatName: link.chatName,
                  username: link.username,
                  forwardEnabled: link.forwardEnabled,
                  offlineNotify: link.offlineNotify,
                  allowBotDm: link.allowBotDm,
                  mutedRooms,
                }
              : null
          }
          commands={BOT_COMMANDS}
        />

        <InstallAppCard />

        {/* Secret entrance to hidden chats lives here (tap the version 5 times). */}
        <VersionTap rooms={ownedRooms} />
      </div>
    </div>
  );
}
