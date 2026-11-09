import Link from "next/link";
import { Activity, MessageCircle, MessagesSquare, Send, Users, Wifi } from "lucide-react";
import { and, desc, eq, gt, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, messages, roomMembers, rooms, sessions, telegramLinks, users } from "@/db/schema";
import { PageHeader, Section, StatCard } from "@/components/admin/parts";
import { Avatar } from "@/components/brand";
import { LocalTime } from "@/components/ui";
import { getAdminBase, getAdminSession, isAdminSlug } from "@/lib/admin-auth";
import { formatNumber } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n-server";
import { fmt } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminOverview({ params }: { params: Promise<{ panel: string }> }) {
  const { panel } = await params;
  if (!isAdminSlug(panel) || !(await getAdminSession())) return null;
  const base = await getAdminBase();
  const { t, lang } = await getI18n();
  const n = (v: number) => formatNumber(v, lang);

  const [[u], [r], [m], [b], [s], [o]] = await Promise.all([
    db.select({ total: sql<number>`count(*)::int`, suspended: sql<number>`(count(*) filter (where ${users.status} = 'suspended'))::int` }).from(users),
    db.select({ total: sql<number>`count(*)::int`, disabled: sql<number>`(count(*) filter (where ${rooms.isDisabled}))::int` }).from(rooms),
    db
      .select({ total: sql<number>`count(*)::int`, day: sql<number>`(count(*) filter (where ${messages.createdAt} > now() - interval '24 hours'))::int` })
      .from(messages)
      .where(ne(messages.authorRole, "system")),
    db.select({ total: sql<number>`count(*)::int`, linked: sql<number>`count(*)::int` }).from(telegramLinks),
    db.select({ n: sql<number>`count(*)::int` }).from(sessions).where(gt(sessions.expiresAt, new Date())),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(roomMembers)
      .where(and(isNotNull(roomMembers.nickname), gt(roomMembers.lastSeenAt, sql`now() - interval '45 seconds'`))),
  ]);
  const [newest, active, audits] = await Promise.all([
    db.select().from(users).orderBy(desc(users.createdAt)).limit(6),
    db
      .select({ room: rooms, owner: users.username })
      .from(rooms)
      .innerJoin(users, eq(users.id, rooms.ownerId))
      .orderBy(desc(rooms.lastActivityAt))
      .limit(6),
    db.select().from(auditLogs).orderBy(desc(auditLogs.id)).limit(8),
  ]);

  return (
    <>
      <PageHeader title={t.admin.overviewTitle} subtitle={t.admin.overviewSubtitle} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard icon={Users} label={t.admin.statUsers} value={n(u.total)} hint={fmt(t.admin.statSuspended, { n: n(u.suspended) })} />
        <StatCard icon={MessagesSquare} label={t.admin.statRooms} value={n(r.total)} hint={fmt(t.admin.statDisabled, { n: n(r.disabled) })} tone="bg-lavender-soft text-accent-ink" />
        <StatCard icon={MessageCircle} label={t.admin.statMessages} value={n(m.total)} hint={fmt(t.admin.statMessages24, { n: n(m.day) })} tone="bg-mint-soft text-mint-ink" />
        <StatCard icon={Send} label={t.admin.statLinks} value={n(b.total)} hint={fmt(t.admin.statAccounts, { n: n(b.linked) })} tone="bg-sky-soft text-sky-ink" />
        <StatCard icon={Wifi} label={t.admin.statOnline} value={n(o.n)} tone="bg-mint-soft text-mint-ink" />
        <StatCard icon={Activity} label={t.admin.statSessions} value={n(s.n)} tone="bg-amber-soft text-amber-ink" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Section
          title={t.admin.newestUsers}
          icon={Users}
          actions={
            <Link href={`${base}/users`} className="btn btn-ghost btn-sm">
              {t.admin.viewAll}
            </Link>
          }
        >
          <ul className="divide-y divide-line">
            {newest.length === 0 ? <li className="px-5 py-8 text-center text-sm text-muted">{t.admin.empty}</li> : null}
            {newest.map((user) => (
              <li key={user.id}>
                <Link href={`${base}/users/${user.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-surface-2">
                  <Avatar name={user.displayName} size={34} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink">{user.displayName}</p>
                    <p className="text-xs text-muted" dir="ltr">
                      @{user.username}
                    </p>
                  </div>
                  <LocalTime iso={user.createdAt.toISOString()} mode="relative" className="text-xs text-faint" />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
        <Section
          title={t.admin.activeRooms}
          icon={MessagesSquare}
          tone="bg-lavender-soft text-accent-ink"
          actions={
            <Link href={`${base}/rooms`} className="btn btn-ghost btn-sm">
              {t.admin.viewAll}
            </Link>
          }
        >
          <ul className="divide-y divide-line">
            {active.length === 0 ? <li className="px-5 py-8 text-center text-sm text-muted">{t.admin.empty}</li> : null}
            {active.map(({ room, owner }) => (
              <li key={room.id}>
                <Link href={`${base}/rooms/${room.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-surface-2">
                  <Avatar name={room.name} size={34} square />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink" dir="auto">
                      {room.name}
                    </p>
                    <p className="text-xs text-muted" dir="ltr">
                      @{owner}
                    </p>
                  </div>
                  <LocalTime iso={room.lastActivityAt.toISOString()} mode="relative" className="text-xs text-faint" />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      </div>

      <Section
        title={t.admin.recentActivity}
        icon={Activity}
        tone="bg-amber-soft text-amber-ink"
        className="mt-6"
        actions={
          <Link href={`${base}/system`} className="btn btn-ghost btn-sm">
            {t.admin.viewAll}
          </Link>
        }
      >
        <ul className="divide-y divide-line">
          {audits.length === 0 ? <li className="px-5 py-8 text-center text-sm text-muted">{t.admin.noAudit}</li> : null}
          {audits.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-sm">
              <code className="rounded-md bg-surface-3 px-2 py-0.5 font-mono text-xs font-bold text-ink-2" dir="ltr">
                {a.action}
              </code>
              <span className="min-w-0 flex-1 truncate text-xs text-muted" dir="ltr">
                {[a.targetType, a.targetId, a.details].filter(Boolean).join(" · ")}
              </span>
              <LocalTime iso={a.createdAt.toISOString()} mode="relative" className="text-xs text-faint" />
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
