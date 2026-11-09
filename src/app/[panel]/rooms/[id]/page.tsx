import Link from "next/link";
import { notFound } from "next/navigation";
import { Send, KeyRound, MessageCircle, RefreshCw, Settings2, Trash2, Unplug, Users } from "lucide-react";
import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { messages, roomMembers, rooms, telegramBots, telegramLinks, users } from "@/db/schema";
import { adminAction } from "@/app/actions/admin";
import { EmptyRow, PageHeader, Section, TableWrap } from "@/components/admin/parts";
import { Avatar } from "@/components/brand";
import { ActionButton, ActionForm, CopyButton, LocalTime, PasswordInput, SubmitButton } from "@/components/ui";
import { getAdminBase, getAdminSession, isAdminSlug } from "@/lib/admin-auth";
import { getI18n } from "@/lib/i18n-server";
import { getBaseUrl } from "@/lib/request";
import { isUuid, shortId } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminRoomDetail({ params }: { params: Promise<{ panel: string; id: string }> }) {
  const { panel, id } = await params;
  if (!isAdminSlug(panel) || !(await getAdminSession())) return null;
  if (!isUuid(id)) notFound();
  const base = await getAdminBase();
  const [row] = await db
    .select({ room: rooms, owner: users })
    .from(rooms)
    .innerJoin(users, eq(users.id, rooms.ownerId))
    .where(eq(rooms.id, id))
    .limit(1);
  if (!row) notFound();
  const { room, owner } = row;
  const { t } = await getI18n();
  const [baseUrl, members, recent, botRows, ownerLink] = await Promise.all([
    getBaseUrl(),
    db.select().from(roomMembers).where(eq(roomMembers.roomId, room.id)).orderBy(desc(roomMembers.lastSeenAt)).limit(300),
    db
      .select()
      .from(messages)
      .where(and(eq(messages.roomId, room.id), isNull(messages.deletedAt), ne(messages.authorRole, "system")))
      .orderBy(desc(messages.id))
      .limit(50),
    db.select().from(telegramBots).where(eq(telegramBots.roomId, room.id)).limit(1),
    db.select().from(telegramLinks).where(eq(telegramLinks.userId, room.ownerId)).limit(1),
  ]);
  const bot = botRows[0];
  const link = ownerLink[0];
  const inviteUrl = `${baseUrl}/r/${room.inviteToken}`;

  return (
    <>
      <PageHeader
        back={{ href: `${base}/rooms`, label: t.admin.roomsTitle }}
        title={
          <span className="flex items-center gap-3">
            <Avatar name={room.name} size={44} square />
            <span className="min-w-0">
              <span className="block truncate" dir="auto">
                {room.name}
              </span>
              <Link href={`${base}/users/${owner.id}`} className="block text-sm font-semibold text-accent-ink hover:underline" dir="ltr">
                @{owner.username}
              </Link>
            </span>
          </span>
        }
        actions={
          <div className="flex flex-wrap gap-1.5">
            {room.passwordHash ? <span className="badge badge-accent">{t.admin.filterProtected}</span> : null}
            {room.isLocked ? <span className="badge badge-amber">{t.admin.filterLocked}</span> : null}
            {room.isDisabled ? <span className="badge badge-rose">{t.admin.filterDisabled}</span> : null}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={t.admin.roomSettings} icon={Settings2}>
          <ActionForm action={adminAction} className="space-y-4 p-5">
            <input type="hidden" name="op" value="room.update" />
            <input type="hidden" name="id" value={room.id} />
            <div>
              <label className="label" htmlFor="name">
                {t.admin.roomName}
              </label>
              <input id="name" name="name" className="input" defaultValue={room.name} required maxLength={60} dir="auto" />
            </div>
            <div>
              <label className="label" htmlFor="description">
                {t.admin.roomDescription}
              </label>
              <textarea id="description" name="description" className="input" rows={2} maxLength={280} defaultValue={room.description} dir="auto" />
            </div>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
              <span className="text-sm font-bold text-ink">{t.admin.roomLocked}</span>
              <input type="checkbox" name="isLocked" className="switch" defaultChecked={room.isLocked} />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
              <span className="text-sm font-bold text-ink">{t.admin.roomDisabled}</span>
              <input type="checkbox" name="isDisabled" className="switch" defaultChecked={room.isDisabled} />
            </label>
            <SubmitButton className="btn btn-primary btn-sm">{t.common.save}</SubmitButton>
          </ActionForm>
        </Section>

        <Section title={t.admin.roomAccess} icon={KeyRound} tone="bg-lavender-soft text-accent-ink">
          <div className="space-y-5 p-5">
            <div>
              <p className="label">{t.admin.inviteLink}</p>
              <div className="break-all rounded-xl border border-line bg-surface-2 p-3 font-mono text-xs text-ink-2" dir="ltr">
                {inviteUrl}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <CopyButton value={inviteUrl} />
                <ActionButton action={adminAction} fields={{ op: "room.rotate", id: room.id }} confirm={t.room.rotateConfirm} className="btn btn-soft btn-sm">
                  <RefreshCw className="size-4" />
                  {t.admin.rotateLink}
                </ActionButton>
              </div>
            </div>
            <div className="border-t border-line pt-5">
              <p className="label flex items-center justify-between">
                {t.admin.passwordProtected}
                <span className={`badge ${room.passwordHash ? "badge-mint" : "badge-neutral"}`}>
                  {room.passwordHash ? t.common.enabled : t.admin.noPassword}
                </span>
              </p>
              <ActionForm action={adminAction} resetOnSuccess className="mt-2 flex flex-col gap-2 sm:flex-row">
                <input type="hidden" name="op" value="room.password" />
                <input type="hidden" name="id" value={room.id} />
                <div className="sm:flex-1">
                  <PasswordInput id="admin-room-password" name="password" autoComplete="new-password" minLength={4} placeholder={t.room.newPassword} />
                </div>
                <SubmitButton className="btn btn-secondary h-11">{t.admin.setPassword}</SubmitButton>
              </ActionForm>
              {room.passwordHash ? (
                <div className="mt-3">
                  <ActionButton action={adminAction} fields={{ op: "room.removePassword", id: room.id }} confirm={t.room.removePasswordConfirm} className="btn btn-danger btn-sm">
                    {t.admin.removePassword}
                  </ActionButton>
                </div>
              ) : null}
            </div>
          </div>
        </Section>
      </div>

      <Section title={t.admin.integration} icon={Send} tone="bg-sky-soft text-sky-ink" className="mt-6">
        {link ? (
          <div className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
              <p>
                <span className="text-muted">{t.admin.colChat}: </span>
                <b dir="auto">{link.chatName}</b>
                {link.username ? <span className="text-muted" dir="ltr"> · @{link.username}</span> : null}
              </p>
              <p>
                <span className="text-muted">{t.admin.colForwarding}: </span>
                <span className={`badge ${link.forwardEnabled && !link.mutedRooms.includes(room.id) ? "badge-mint" : "badge-neutral"}`}>
                  {link.forwardEnabled ? (link.mutedRooms.includes(room.id) ? t.admin.forwardMuted : t.admin.forwardOn) : t.admin.forwardPaused}
                </span>
              </p>
              <p>
                <span className="text-muted">{t.admin.colLinked}: </span>
                <span dir="ltr">{link.chatId}</span>
              </p>
            </div>
            <ActionButton action={adminAction} fields={{ op: "link.unlink", id: link.id }} confirm={t.admin.unlinkConfirm} className="btn btn-danger btn-sm">
              <Unplug className="size-4" />
              {t.admin.unlink}
            </ActionButton>
          </div>
        ) : (
          <p className="p-5 text-sm text-muted">{t.admin.noIntegration}</p>
        )}
        {bot ? (
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line p-5">
            <p className="text-xs text-muted">
              {t.admin.legacyBot} — <b dir="ltr">@{bot.botUsername}</b> ({bot.tokenHint})
            </p>
            <ActionButton action={adminAction} fields={{ op: "bot.disconnect", id: room.id }} confirm={t.admin.disconnectConfirm} className="btn btn-secondary btn-sm">
              <RefreshCw className="size-4" />
              {t.admin.disconnect}
            </ActionButton>
          </div>
        ) : null}
      </Section>

      <Section title={t.admin.roomMembers} icon={Users} tone="bg-mint-soft text-mint-ink" className="mt-6">
        <TableWrap>
          <table className="table">
            <thead>
              <tr>
                <th>{t.admin.colUser}</th>
                <th>{t.admin.colStatus}</th>
                <th>{t.admin.colActivity}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {members.filter((m) => m.nickname).length === 0 ? <EmptyRow colSpan={4} text={t.admin.empty} /> : null}
              {members
                .filter((m) => m.nickname)
                .map((m) => (
                  <tr key={m.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <Avatar name={m.nickname ?? "?"} size={30} />
                        <span className="font-bold text-ink" dir="auto">
                          {m.nickname}
                        </span>
                        {m.role === "owner" ? <span className="badge badge-accent">{t.common.owner}</span> : null}
                        <code className="font-mono text-xs text-faint" dir="ltr">
                          #{shortId(m.id)}
                        </code>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${m.status === "active" ? "badge-mint" : "badge-rose"}`}>
                        {m.status === "active" ? t.admin.statusActive : t.room.removed}
                      </span>
                    </td>
                    <td className="whitespace-nowrap text-muted">
                      <LocalTime iso={m.lastSeenAt.toISOString()} mode="relative" />
                    </td>
                    <td className="text-end">
                      {m.role === "guest" ? (
                        <ActionButton
                          action={adminAction}
                          fields={{ op: m.status === "active" ? "member.ban" : "member.unban", id: m.id, roomId: room.id }}
                          className={`btn btn-sm ${m.status === "active" ? "btn-danger" : "btn-secondary"}`}
                        >
                          {m.status === "active" ? t.admin.ban : t.admin.unban}
                        </ActionButton>
                      ) : null}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </TableWrap>
      </Section>

      <Section
        title={t.admin.recentMessages}
        icon={MessageCircle}
        tone="bg-amber-soft text-amber-ink"
        className="mt-6"
        actions={
          <ActionButton action={adminAction} fields={{ op: "room.clear", id: room.id }} confirm={t.admin.clearConfirm} className="btn btn-danger btn-sm">
            {t.admin.clearMessages}
          </ActionButton>
        }
      >
        <ul className="divide-y divide-line">
          {recent.length === 0 ? <li className="px-5 py-8 text-center text-sm text-muted">{t.admin.empty}</li> : null}
          {recent.map((msg) => (
            <li key={msg.id} className="flex items-start gap-3 px-5 py-3">
              <Avatar name={msg.authorName} size={30} />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-xs">
                  <b className="text-ink" dir="auto">
                    {msg.authorName}
                  </b>
                  {msg.authorRole === "owner" ? <span className="badge badge-accent">{t.common.owner}</span> : null}
                  {msg.source === "telegram" ? <span className="badge badge-sky">Telegram</span> : null}
                  <LocalTime iso={msg.createdAt.toISOString()} className="text-faint" />
                </p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-ink-2" dir="auto">
                  {msg.body}
                </p>
              </div>
              <ActionButton action={adminAction} fields={{ op: "message.delete", id: String(msg.id), roomId: room.id }} className="btn btn-ghost btn-icon btn-sm" title={t.common.delete}>
                <Trash2 className="size-4" />
              </ActionButton>
            </li>
          ))}
        </ul>
      </Section>

      <div className="mt-6 flex justify-end">
        <ActionButton action={adminAction} fields={{ op: "room.delete", id: room.id }} confirm={t.admin.deleteRoomConfirm} className="btn btn-danger">
          <Trash2 className="size-4" />
          {t.admin.deleteRoom}
        </ActionButton>
      </div>
    </>
  );
}
