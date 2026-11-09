import Link from "next/link";
import Form from "next/form";
import { Search } from "lucide-react";
import { and, desc, eq, ilike, isNotNull, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { rooms, telegramLinks, users } from "@/db/schema";
import { EmptyRow, PageHeader, TableWrap } from "@/components/admin/parts";
import { Avatar } from "@/components/brand";
import { LocalTime } from "@/components/ui";
import { getAdminBase, getAdminSession, isAdminSlug } from "@/lib/admin-auth";
import { formatNumber } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n-server";
import { roomCounters } from "@/lib/rooms";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const likeTerm = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export default async function AdminRooms({
  params,
  searchParams,
}: {
  params: Promise<{ panel: string }>;
  searchParams: Promise<{ q?: string; f?: string }>;
}) {
  const { panel } = await params;
  if (!isAdminSlug(panel) || !(await getAdminSession())) return null;
  const base = await getAdminBase();
  const { q = "", f = "all" } = await searchParams;
  const term = String(q).trim().slice(0, 64);
  const { t, lang } = await getI18n();

  const conditions: SQL[] = [];
  if (term) conditions.push(or(ilike(rooms.name, likeTerm(term)), ilike(users.username, likeTerm(term)))!);
  if (f === "protected") conditions.push(isNotNull(rooms.passwordHash));
  if (f === "locked") conditions.push(eq(rooms.isLocked, true));
  if (f === "disabled") conditions.push(eq(rooms.isDisabled, true));
  if (f === "bots") conditions.push(isNotNull(telegramLinks.userId));

  const list = await db
    .select({ room: rooms, owner: users.username, ownerId: users.id, tgChat: telegramLinks.chatName })
    .from(rooms)
    .innerJoin(users, eq(users.id, rooms.ownerId))
    .leftJoin(telegramLinks, eq(telegramLinks.userId, rooms.ownerId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(rooms.lastActivityAt))
    .limit(200);
  const counters = await roomCounters(list.map((r) => r.room.id));
  const filters: Array<[string, string]> = [
    ["all", t.admin.filterAll],
    ["protected", t.admin.filterProtected],
    ["locked", t.admin.filterLocked],
    ["disabled", t.admin.filterDisabled],
    ["bots", t.admin.filterBots],
  ];
  const filterHref = (key: string) => {
    const sp = new URLSearchParams();
    if (term) sp.set("q", term);
    if (key !== "all") sp.set("f", key);
    const qs = sp.toString();
    return `${base}/rooms${qs ? `?${qs}` : ""}`;
  };

  return (
    <>
      <PageHeader title={t.admin.roomsTitle} subtitle={t.admin.roomsSubtitle} />
      <Form action={`${base}/rooms`} className="mb-4 flex gap-2">
        {f !== "all" ? <input type="hidden" name="f" value={f} /> : null}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <input name="q" defaultValue={term} className="input ps-10" placeholder={t.admin.searchRooms} />
        </div>
        <button type="submit" className="btn btn-secondary h-11">
          {t.common.search}
        </button>
      </Form>
      <div className="mb-5 flex flex-wrap gap-1.5">
        {filters.map(([key, label]) => (
          <Link key={key} href={filterHref(key)} className={cn("btn btn-sm", f === key || (key === "all" && !filters.some(([k]) => k === f)) ? "btn-soft" : "btn-ghost")}>
            {label}
          </Link>
        ))}
      </div>
      <div className="card overflow-hidden">
        <TableWrap>
          <table className="table">
            <thead>
              <tr>
                <th>{t.admin.colRoom}</th>
                <th>{t.admin.colOwner}</th>
                <th>{t.admin.colMembers}</th>
                <th>{t.admin.colMessages}</th>
                <th>{t.admin.colFlags}</th>
                <th>{t.admin.colActivity}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.length === 0 ? <EmptyRow colSpan={7} text={t.admin.empty} /> : null}
              {list.map(({ room, owner, ownerId, tgChat }) => {
                const c = counters.get(room.id) ?? { members: 0, messages: 0 };
                return (
                  <tr key={room.id}>
                    <td>
                      <div className="flex items-center gap-3">
                        <Avatar name={room.name} size={34} square />
                        <span className="max-w-56 truncate font-bold text-ink" dir="auto">
                          {room.name}
                        </span>
                      </div>
                    </td>
                    <td>
                      <Link href={`${base}/users/${ownerId}`} className="font-semibold text-accent-ink hover:underline" dir="ltr">
                        @{owner}
                      </Link>
                    </td>
                    <td className="font-bold text-ink-2">{formatNumber(c.members, lang)}</td>
                    <td className="font-bold text-ink-2">{formatNumber(c.messages, lang)}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {room.passwordHash ? <span className="badge badge-accent">{t.admin.filterProtected}</span> : null}
                        {room.isLocked ? <span className="badge badge-amber">{t.admin.filterLocked}</span> : null}
                        {room.isDisabled ? <span className="badge badge-rose">{t.admin.filterDisabled}</span> : null}
                        {room.type === "dm" ? <span className="badge badge-mint">{t.admin.dmBadge}</span> : null}
                        {tgChat ? <span className="badge badge-sky">✈ {t.admin.filterTelegram}</span> : null}
                      </div>
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
                );
              })}
            </tbody>
          </table>
        </TableWrap>
      </div>
    </>
  );
}
