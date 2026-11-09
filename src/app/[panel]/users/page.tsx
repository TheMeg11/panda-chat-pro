import Link from "next/link";
import Form from "next/form";
import { Search } from "lucide-react";
import { desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { rooms, users } from "@/db/schema";
import { EmptyRow, PageHeader, TableWrap } from "@/components/admin/parts";
import { Avatar } from "@/components/brand";
import { LocalTime } from "@/components/ui";
import { getAdminBase, getAdminSession, isAdminSlug } from "@/lib/admin-auth";
import { formatNumber } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

const likeTerm = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export default async function AdminUsers({
  params,
  searchParams,
}: {
  params: Promise<{ panel: string }>;
  searchParams: Promise<{ q?: string }>;
}) {
  const { panel } = await params;
  if (!isAdminSlug(panel) || !(await getAdminSession())) return null;
  const base = await getAdminBase();
  const { q = "" } = await searchParams;
  const term = String(q).trim().slice(0, 64);
  const { t, lang } = await getI18n();

  const list = await db
    .select({
      user: users,
      roomCount: sql<number>`(select count(*)::int from ${rooms} where ${rooms.ownerId} = ${users.id})`,
    })
    .from(users)
    .where(term ? or(ilike(users.username, likeTerm(term)), ilike(users.displayName, likeTerm(term))) : undefined)
    .orderBy(desc(users.createdAt))
    .limit(200);

  return (
    <>
      <PageHeader title={t.admin.usersTitle} subtitle={t.admin.usersSubtitle} />
      <Form action={`${base}/users`} className="mb-5 flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <input name="q" defaultValue={term} className="input ps-10" placeholder={t.admin.searchUsers} />
        </div>
        <button type="submit" className="btn btn-secondary h-11">
          {t.common.search}
        </button>
      </Form>
      <div className="card overflow-hidden">
        <TableWrap>
          <table className="table">
            <thead>
              <tr>
                <th>{t.admin.colUser}</th>
                <th>{t.admin.colStatus}</th>
                <th>{t.admin.colRooms}</th>
                <th>{t.admin.colTelegram}</th>
                <th>{t.admin.colJoined}</th>
                <th>{t.admin.colLastLogin}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? <EmptyRow colSpan={7} text={t.admin.empty} /> : null}
              {list.map(({ user, roomCount }) => (
                <tr key={user.id}>
                  <td>
                    <div className="flex items-center gap-3">
                      <Avatar name={user.displayName} size={34} />
                      <div className="min-w-0">
                        <p className="max-w-52 truncate font-bold text-ink">{user.displayName}</p>
                        <p className="text-xs text-muted" dir="ltr">
                          @{user.username}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${user.status === "active" ? "badge-mint" : "badge-rose"}`}>
                      {user.status === "active" ? t.admin.statusActive : t.admin.statusSuspended}
                    </span>
                  </td>
                  <td className="font-bold text-ink-2">{formatNumber(roomCount, lang)}</td>
                  <td>
                    <span className={`badge ${user.canUseTelegram ? "badge-sky" : "badge-neutral"}`}>
                      {user.canUseTelegram ? t.common.enabled : t.common.disabled}
                    </span>
                  </td>
                  <td className="whitespace-nowrap text-muted">
                    <LocalTime iso={user.createdAt.toISOString()} mode="date" />
                  </td>
                  <td className="whitespace-nowrap text-muted">
                    <LocalTime iso={user.lastLoginAt?.toISOString()} mode="relative" />
                  </td>
                  <td className="text-end">
                    <Link href={`${base}/users/${user.id}`} className="btn btn-secondary btn-sm">
                      {t.admin.manage}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableWrap>
      </div>
    </>
  );
}
