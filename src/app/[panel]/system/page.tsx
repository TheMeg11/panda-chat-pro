import { Database, History, KeyRound, LogOut, ServerCog, Trash2 } from "lucide-react";
import { desc, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminSessions, auditLogs, messages, roomMembers, rooms, sessions, telegramBots, telegramLinks, users } from "@/db/schema";
import { adminAction } from "@/app/actions/admin";
import { EmptyRow, PageHeader, Section, TableWrap } from "@/components/admin/parts";
import { ActionButton, LocalTime } from "@/components/ui";
import { getAdminConfig, getAdminSession, isAdminSlug } from "@/lib/admin-auth";
import { formatNumber } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n-server";
import { getSettings } from "@/lib/settings";
import { pollerStatus } from "@/lib/telegram/poller";
import { fmt } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminSystem({ params }: { params: Promise<{ panel: string }> }) {
  const { panel } = await params;
  if (!isAdminSlug(panel) || !(await getAdminSession())) return null;
  const { t, lang } = await getI18n();
  const n = (v: number) => formatNumber(v, lang);
  const now = new Date();
  const count = sql<number>`count(*)::int`;
  const [[us], [as], [cu], [cr], [cm], [cmb], [cb], [cl], [ca], audits, settings] = await Promise.all([
    db.select({ n: count }).from(sessions).where(gt(sessions.expiresAt, now)),
    db.select({ n: count }).from(adminSessions).where(gt(adminSessions.expiresAt, now)),
    db.select({ n: count }).from(users),
    db.select({ n: count }).from(rooms),
    db.select({ n: count }).from(messages),
    db.select({ n: count }).from(roomMembers),
    db.select({ n: count }).from(telegramBots),
    db.select({ n: count }).from(telegramLinks),
    db.select({ n: count }).from(auditLogs),
    db.select().from(auditLogs).orderBy(desc(auditLogs.id)).limit(100),
    getSettings(),
  ]);
  const config = getAdminConfig();
  const poller = pollerStatus();
  const env: Array<[string, string]> = [
    [t.admin.envAdminPath, `/${config.path}`],
    [t.admin.envRuntime, `Node ${process.version} · ${process.env.NODE_ENV ?? "development"}`],
    [
      t.admin.envTelegramMode,
      `${process.env.TELEGRAM_MODE === "webhook" ? "webhook" : "long polling"} · ${poller.started && poller.running > 0 ? fmt(t.admin.pollerRunning, { n: n(poller.running) }) : t.admin.pollerStopped}`,
    ],
    [t.admin.envAppSecret, process.env.APP_SECRET ? t.admin.envSet : t.admin.envFallback],
    [t.admin.envPublicUrl, settings.publicUrl || process.env.APP_URL || t.admin.auto],
  ];
  const tables: Array<[string, number]> = [
    ["users", cu.n],
    ["rooms", cr.n],
    ["messages", cm.n],
    ["room_members", cmb.n],
    ["telegram_links", cl.n],
    ["telegram_bots (legacy)", cb.n],
    ["audit_logs", ca.n],
  ];

  return (
    <>
      <PageHeader title={t.admin.systemTitle} subtitle={t.admin.systemSubtitle} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Section title={t.admin.sessionsTitle} icon={KeyRound} tone="bg-amber-soft text-amber-ink">
          <div className="space-y-4 p-5">
            <div className="space-y-1 text-sm">
              <p className="font-bold text-ink">{fmt(t.admin.activeUserSessions, { n: n(us.n) })}</p>
              <p className="text-muted">{fmt(t.admin.activeAdminSessions, { n: n(as.n) })}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ActionButton action={adminAction} fields={{ op: "system.revokeAll" }} confirm={t.admin.revokeAllConfirm} className="btn btn-danger btn-sm">
                <LogOut className="size-4 rtl:-scale-x-100" />
                {t.admin.revokeAll}
              </ActionButton>
              <ActionButton action={adminAction} fields={{ op: "system.purge" }} className="btn btn-secondary btn-sm">
                <Trash2 className="size-4" />
                {t.admin.purgeExpired}
              </ActionButton>
            </div>
          </div>
        </Section>
        <Section title={t.admin.environment} icon={ServerCog} className="lg:col-span-2">
          <dl className="divide-y divide-line">
            {env.map(([label, value]) => (
              <div key={label} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                <dt className="font-bold text-muted">{label}</dt>
                <dd className="font-mono text-xs text-ink-2" dir="ltr">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </Section>
      </div>

      <Section title={t.admin.database} icon={Database} tone="bg-sky-soft text-sky-ink" className="mt-6">
        <div className="grid grid-cols-2 gap-px bg-line sm:grid-cols-3 lg:grid-cols-6">
          {tables.map(([name, value]) => (
            <div key={name} className="bg-surface px-5 py-4">
              <p className="font-mono text-[11px] text-muted">{name}</p>
              <p className="mt-1 text-xl font-extrabold text-ink">{n(value)}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section title={t.admin.auditTitle} icon={History} tone="bg-lavender-soft text-accent-ink" className="mt-6">
        <TableWrap>
          <table className="table">
            <thead>
              <tr>
                <th>{t.admin.colTime}</th>
                <th>{t.admin.colAction}</th>
                <th>{t.admin.colTarget}</th>
                <th>{t.admin.colDetails}</th>
              </tr>
            </thead>
            <tbody>
              {audits.length === 0 ? <EmptyRow colSpan={4} text={t.admin.noAudit} /> : null}
              {audits.map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap text-muted">
                    <LocalTime iso={a.createdAt.toISOString()} />
                  </td>
                  <td>
                    <code className="rounded-md bg-surface-3 px-2 py-0.5 font-mono text-xs font-bold text-ink-2" dir="ltr">
                      {a.action}
                    </code>
                  </td>
                  <td className="font-mono text-xs text-muted" dir="ltr">
                    {[a.targetType, a.targetId].filter(Boolean).join(":") || "—"}
                  </td>
                  <td className="max-w-80 truncate text-xs text-muted" dir="ltr" title={a.details ?? undefined}>
                    {a.details ?? "—"}
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
