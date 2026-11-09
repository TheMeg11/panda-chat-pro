import Link from "next/link";
import { notFound } from "next/navigation";
import { KeyRound, LogOut, MessagesSquare, ShieldCheck, Trash2 } from "lucide-react";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { rooms, sessions, telegramLinks, users } from "@/db/schema";
import { adminAction } from "@/app/actions/admin";
import { EmptyRow, PageHeader, Section, TableWrap } from "@/components/admin/parts";
import { Avatar } from "@/components/brand";
import { ActionButton, ActionForm, LocalTime, PasswordInput, SubmitButton } from "@/components/ui";
import { getAdminBase, getAdminSession, isAdminSlug } from "@/lib/admin-auth";
import { formatNumber } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n-server";
import { getSettings } from "@/lib/settings";
import { fmt, isUuid } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminUserDetail({ params }: { params: Promise<{ panel: string; id: string }> }) {
  const { panel, id } = await params;
  if (!isAdminSlug(panel) || !(await getAdminSession())) return null;
  if (!isUuid(id)) notFound();
  const base = await getAdminBase();
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user) notFound();
  const { t, lang } = await getI18n();
  const [settings, owned, [sess]] = await Promise.all([
    getSettings(),
    db
      .select({ room: rooms, linked: telegramLinks.chatId })
      .from(rooms)
      .leftJoin(telegramLinks, eq(telegramLinks.userId, rooms.ownerId))
      .where(eq(rooms.ownerId, user.id))
      .orderBy(desc(rooms.lastActivityAt)),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(sessions)
      .where(and(eq(sessions.userId, user.id), gt(sessions.expiresAt, new Date()))),
  ]);

  return (
    <>
      <PageHeader
        back={{ href: `${base}/users`, label: t.admin.usersTitle }}
        title={
          <span className="flex items-center gap-3">
            <Avatar name={user.displayName} size={44} />
            <span className="min-w-0">
              <span className="block truncate">{user.displayName}</span>
              <span className="block text-sm font-semibold text-muted" dir="ltr">
                @{user.username}
              </span>
            </span>
          </span>
        }
        actions={
          <span className={`badge ${user.status === "active" ? "badge-mint" : "badge-rose"}`}>
            {user.status === "active" ? t.admin.statusActive : t.admin.statusSuspended}
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={t.admin.userPermissions} icon={ShieldCheck}>
          <ActionForm action={adminAction} className="space-y-4 p-5">
            <input type="hidden" name="op" value="user.update" />
            <input type="hidden" name="id" value={user.id} />
            <div>
              <label className="label" htmlFor="status">
                {t.admin.accountStatus}
              </label>
              <select id="status" name="status" className="input" defaultValue={user.status}>
                <option value="active">{t.admin.statusActive}</option>
                <option value="suspended">{t.admin.statusSuspended}</option>
              </select>
            </div>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
              <span className="min-w-0">
                <span className="block text-sm font-bold text-ink">{t.admin.canUseTelegram}</span>
                <span className="mt-0.5 block text-xs font-semibold text-muted">{t.admin.canUseTelegramHint}</span>
              </span>
              <input type="checkbox" name="canUseTelegram" className="switch" defaultChecked={user.canUseTelegram} />
            </label>
            <div>
              <label className="label" htmlFor="maxRooms">
                {t.admin.roomLimit}
              </label>
              <input
                id="maxRooms"
                name="maxRooms"
                type="number"
                min={0}
                max={10000}
                className="input"
                defaultValue={user.maxRooms ?? ""}
                placeholder={String(settings.defaultMaxRooms)}
              />
              <p className="hint">{fmt(t.admin.roomLimitHint, { n: formatNumber(settings.defaultMaxRooms, lang) })}</p>
            </div>
            <SubmitButton className="btn btn-primary btn-sm">{t.admin.savePermissions}</SubmitButton>
          </ActionForm>
        </Section>

        <div className="space-y-6">
          <Section title={t.admin.resetPassword} icon={KeyRound} tone="bg-lavender-soft text-accent-ink">
            <ActionForm action={adminAction} resetOnSuccess className="space-y-3 p-5">
              <input type="hidden" name="op" value="user.password" />
              <input type="hidden" name="id" value={user.id} />
              <p className="text-sm text-muted">{t.admin.resetPasswordHint}</p>
              <PasswordInput id="new-user-password" name="password" autoComplete="new-password" minLength={8} placeholder={t.admin.newPassword} />
              <SubmitButton className="btn btn-secondary btn-sm">{t.admin.resetPassword}</SubmitButton>
            </ActionForm>
          </Section>
          <Section title={t.admin.sessionsTitle} icon={LogOut} tone="bg-amber-soft text-amber-ink">
            <div className="flex flex-wrap items-center justify-between gap-3 p-5">
              <p className="text-sm text-muted">{fmt(t.admin.sessionsCount, { n: formatNumber(sess.n, lang) })}</p>
              <div className="flex flex-wrap gap-2">
                <ActionButton action={adminAction} fields={{ op: "user.revoke", id: user.id }} className="btn btn-secondary btn-sm">
                  <LogOut className="size-4 rtl:-scale-x-100" />
                  {t.admin.revokeSessions}
                </ActionButton>
                <ActionButton action={adminAction} fields={{ op: "user.delete", id: user.id }} confirm={t.admin.deleteUserConfirm} className="btn btn-danger btn-sm">
                  <Trash2 className="size-4" />
                  {t.admin.deleteUser}
                </ActionButton>
              </div>
            </div>
          </Section>
        </div>
      </div>

      <Section title={t.admin.userRooms} icon={MessagesSquare} className="mt-6" tone="bg-sky-soft text-sky-ink">
        <TableWrap>
          <table className="table">
            <thead>
              <tr>
                <th>{t.admin.colRoom}</th>
                <th>{t.admin.colFlags}</th>
                <th>{t.common.owner}</th>
                <th>{t.admin.colActivity}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {owned.length === 0 ? <EmptyRow colSpan={5} text={t.admin.empty} /> : null}
              {owned.map(({ room, linked }) => (
                <tr key={room.id}>
                  <td className="max-w-64 truncate font-bold text-ink" dir="auto">
                    {room.name}
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {room.passwordHash ? <span className="badge badge-accent">{t.admin.filterProtected}</span> : null}
                      {room.isLocked ? <span className="badge badge-amber">{t.admin.filterLocked}</span> : null}
                      {room.isDisabled ? <span className="badge badge-rose">{t.admin.filterDisabled}</span> : null}
                      {linked ? <span className="badge badge-sky">✈ {t.admin.filterTelegram}</span> : null}
                    </div>
                  </td>
                  <td className="text-muted" dir="ltr">
                    @{user.username}
                  </td>
                  <td className="whitespace-nowrap text-muted">
                    <LocalTime iso={room.lastActivityAt.toISOString()} mode="relative" />
                  </td>
                  <td className="text-end">
                    <Link href={`${base}/rooms/${room.id}`} className="btn btn-secondary btn-sm">
                      {t.admin.manage}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </Section>
    </>
  );
}
