import Link from "next/link";
import { Bot, KeyRound, Radio, Send, Users } from "lucide-react";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { telegramLinks, users } from "@/db/schema";
import { adminAction } from "@/app/actions/admin";
import { EmptyRow, PageHeader, Section, TableWrap } from "@/components/admin/parts";
import { ActionButton, ActionForm, LocalTime, PasswordInput, SubmitButton } from "@/components/ui";
import { getAdminBase, getAdminSession, isAdminSlug } from "@/lib/admin-auth";
import { formatNumber } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n-server";
import { getSettings } from "@/lib/settings";
import { pollerStatus } from "@/lib/telegram/poller";
import { getPlatformBot } from "@/lib/telegram/platform";
import { fmt } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AdminTelegram({ params }: { params: Promise<{ panel: string }> }) {
  const { panel } = await params;
  if (!isAdminSlug(panel) || !(await getAdminSession())) return null;
  const base = await getAdminBase();
  const { t, lang } = await getI18n();
  const [settings, bot, links] = await Promise.all([
    getSettings(),
    getPlatformBot(),
    db
      .select({
        link: telegramLinks,
        username: users.username,
        displayName: users.displayName,
        userId: users.id,
      })
      .from(telegramLinks)
      .innerJoin(users, eq(users.id, telegramLinks.userId))
      .orderBy(desc(telegramLinks.createdAt)),
  ]);
  const poller = pollerStatus();

  return (
    <>
      <PageHeader
        title={t.admin.telegramTitle}
        subtitle={t.admin.telegramSubtitle}
        actions={
          <div className="card flex items-center gap-3 px-4 py-2.5">
            <span className={`grid size-8 place-items-center rounded-lg ${poller.running > 0 ? "bg-mint-soft text-mint-ink" : "bg-amber-soft text-amber-ink"}`}>
              <Radio className="size-4" />
            </span>
            <div className="text-xs">
              <p className="font-bold text-ink">{t.admin.pollerTitle}</p>
              <p className="text-muted">
                {!settings.telegramEnabled
                  ? t.common.disabled
                  : poller.running > 0
                    ? t.admin.pollerOnline
                    : t.admin.pollerStopped}
              </p>
            </div>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Section title={t.admin.botTokenTitle} icon={KeyRound} className="lg:col-span-2">
          <ActionForm action={adminAction} resetOnSuccess className="p-5">
            <input type="hidden" name="op" value="bot.token" />
            <p className="text-sm leading-relaxed text-muted">{t.admin.botTokenText}</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <div>
                <label className="label" htmlFor="bot-token-input">
                  {t.admin.botTokenLabel}
                </label>
                <PasswordInput
                  id="bot-token-input"
                  name="token"
                  autoComplete="off"
                  required={false}
                  placeholder={bot.hint ? `${bot.hint} — ${t.admin.botTokenKeepHint}` : "123456789:AA…"}
                />
                <p className="hint">{t.admin.botTokenHint}</p>
              </div>
              <SubmitButton className="btn btn-primary btn-sm">{t.admin.botTokenSave}</SubmitButton>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface-2 p-3 text-xs">
              <span className={`badge ${bot.configured ? (bot.lastError ? "badge-rose" : "badge-mint") : "badge-amber"}`}>
                {bot.configured ? (bot.lastError ? t.admin.botStatusError : t.admin.botStatusOk) : t.admin.botStatusMissing}
              </span>
              {bot.botUsername ? (
                <span className="font-mono text-ink-2" dir="ltr">
                  @{bot.botUsername}
                </span>
              ) : null}
              {bot.hint ? (
                <span className="font-mono text-faint" dir="ltr">
                  {bot.hint}
                </span>
              ) : null}
              <span className="text-faint">· {bot.source === "db" ? t.admin.botSourceDb : bot.source === "env" ? t.admin.botSourceEnv : t.admin.botSourceNone}</span>
            </div>
            {bot.lastError ? (
              <p className="notice notice-rose mt-3 text-xs" dir="ltr">
                {bot.lastError}
              </p>
            ) : null}
          </ActionForm>
        </Section>

        <Section title={t.admin.botConfigTitle} icon={Bot} tone="bg-sky-soft text-sky-ink">
          <ActionForm action={adminAction} className="space-y-4 p-5">
            <input type="hidden" name="op" value="bot.config" />
            <label className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
              <span className="text-sm font-bold text-ink">{t.admin.botEnabled}</span>
              <input type="checkbox" name="telegramEnabled" className="switch" defaultChecked={settings.telegramEnabled} />
            </label>
            <label className="flex items-center justify-between gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
              <span className="text-sm font-bold text-ink">
                {t.admin.botPaid}
                <span className="mt-0.5 block text-xs font-semibold text-muted">{t.admin.botPaidHint}</span>
              </span>
              <input type="checkbox" name="telegramPaid" className="switch" defaultChecked={settings.telegramPaid} />
            </label>
            <SubmitButton className="btn btn-primary btn-sm">{t.common.save}</SubmitButton>
          </ActionForm>
        </Section>
      </div>

      <div className="mt-6">
        <Section
          title={t.admin.linkedTitle}
          icon={Users}
          tone="bg-lavender-soft text-accent-ink"
          actions={<span className="badge badge-neutral">{formatNumber(links.length, lang)}</span>}
        >
          <TableWrap>
            <table className="table">
              <thead>
                <tr>
                  <th>{t.admin.colUser}</th>
                  <th>{t.admin.colChat}</th>
                  <th>{t.admin.colLinked}</th>
                  <th>{t.admin.colForwarding}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {links.length === 0 ? <EmptyRow colSpan={5} text={t.admin.noLinks} /> : null}
                {links.map(({ link, username, displayName, userId }) => (
                  <tr key={link.id}>
                    <td>
                      <Link href={`${base}/users/${userId}`} className="font-bold text-ink hover:underline" dir="auto">
                        {displayName}
                      </Link>
                      <p className="text-xs text-muted" dir="ltr">
                        @{username}
                      </p>
                    </td>
                    <td className="max-w-56 truncate">
                      <p className="text-ink-2" dir="auto">
                        {link.chatName}
                      </p>
                      {link.username ? (
                        <p className="text-xs text-muted" dir="ltr">
                          @{link.username}
                        </p>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap text-muted">
                      <LocalTime iso={link.createdAt.toISOString()} mode="relative" />
                    </td>
                    <td>
                      <span className={`badge ${link.forwardEnabled ? "badge-mint" : "badge-neutral"}`}>
                        {link.forwardEnabled ? t.admin.forwardOn : t.admin.forwardPaused}
                      </span>
                      {link.mutedRooms.length > 0 ? (
                        <p className="mt-1 text-[11px] text-faint">{fmt(t.admin.mutedRooms, { n: formatNumber(link.mutedRooms.length, lang) })}</p>
                      ) : null}
                    </td>
                    <td>
                      <div className="flex justify-end">
                        <ActionButton action={adminAction} fields={{ op: "link.unlink", id: link.id }} confirm={t.admin.unlinkConfirm} className="btn btn-danger btn-sm">
                          <Send className="size-4" />
                          {t.admin.unlink}
                        </ActionButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Section>
      </div>
    </>
  );
}
