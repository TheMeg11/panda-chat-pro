import { CalendarClock, DatabaseBackup, FileArchive, KeyRound, Send, ShieldCheck, TriangleAlert } from "lucide-react";
import { adminAction } from "@/app/actions/admin";
import { PageHeader, Section } from "@/components/admin/parts";
import { ActionButton, ActionForm, PasswordInput, SubmitButton } from "@/components/ui";
import { getAdminBase, getAdminSession, isAdminSlug } from "@/lib/admin-auth";
import { getLastBackupResult, getBackupConfig, superadminBotToken } from "@/lib/backup";
import { formatNumber } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n-server";
import { getPlatformBot } from "@/lib/telegram/platform";
import { fmt } from "@/lib/utils";

export const dynamic = "force-dynamic";

function TimeIso({ iso }: { iso: string }) {
  return (
    <time dateTime={iso}>
      {new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Tehran", dateStyle: "medium", timeStyle: "short" })}
    </time>
  );
}

export default async function AdminBackups({ params }: { params: Promise<{ panel: string }> }) {
  const { panel } = await params;
  if (!isAdminSlug(panel) || !(await getAdminSession())) return null;
  await getAdminBase(); // panel works on both the secret path and the dedicated admin host
  const { t, lang } = await getI18n();
  const n = (v: number) => formatNumber(v, lang);

  const [config, last, bot] = await Promise.all([getBackupConfig(), getLastBackupResult(), getPlatformBot()]);
  const botConfigured = Boolean(await superadminBotToken());

  return (
    <>
      <PageHeader title={t.admin.backupsTitle} subtitle={t.admin.backupsSubtitle} />

      {!botConfigured || !config.chatId ? (
        <div className="notice notice-amber mb-6">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>{!botConfigured ? t.admin.backupsBotMissing : t.admin.backupsChatMissing}</span>
        </div>
      ) : null}

      <Section title={t.admin.backupsBotTitle} icon={KeyRound} tone="bg-sky-soft text-sky-ink" className="mb-6">
        <ActionForm action={adminAction} resetOnSuccess className="p-5">
          <input type="hidden" name="op" value="bot.token" />
          <p className="text-sm leading-relaxed text-muted">{t.admin.backupsBotText}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <label className="label" htmlFor="backup-bot-token">
                {t.admin.botTokenLabel}
              </label>
              <PasswordInput
                id="backup-bot-token"
                name="token"
                autoComplete="off"
                required={false}
                placeholder={bot.hint ? `${bot.hint} — ${t.admin.botTokenKeepHint}` : "123456789:AA…"}
              />
              <p className="hint">{t.admin.backupsBotHint}</p>
            </div>
            <SubmitButton className="btn btn-primary btn-sm">{t.admin.botTokenSave}</SubmitButton>
          </div>
          {bot.botUsername ? (
            <p className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className={`badge ${bot.lastError ? "badge-rose" : "badge-mint"}`}>{bot.lastError ? t.admin.botStatusError : t.admin.botStatusOk}</span>
              <span className="font-mono text-ink-2" dir="ltr">
                @{bot.botUsername}
              </span>
              <span className="font-mono text-faint" dir="ltr">
                {bot.hint}
              </span>
            </p>
          ) : null}
        </ActionForm>
      </Section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Section title={t.admin.backupsScheduleTitle} icon={CalendarClock} tone="bg-sky-soft text-sky-ink" className="lg:col-span-2">
          <ActionForm action={adminAction} className="p-5">
            <input type="hidden" name="op" value="backup.config" />
            <div className="grid gap-5 sm:grid-cols-3">
              <div>
                <label className="label" htmlFor="backup-hour">
                  {t.admin.backupsHour}
                </label>
                <select id="backup-hour" name="hour" className="input" defaultValue={config.hour}>
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, "0")}:00
                    </option>
                  ))}
                </select>
                <p className="hint">{t.admin.backupsHourHint}</p>
              </div>
              <div>
                <label className="label" htmlFor="backup-chat">
                  {t.admin.backupsChat}
                </label>
                <input id="backup-chat" name="chatId" className="input" inputMode="numeric" dir="ltr" defaultValue={config.chatId} placeholder="123456789" />
                <p className="hint">{t.admin.backupsChatHint}</p>
              </div>
              <div>
                <span className="label">{t.admin.backupsEnabled}</span>
                <label className="flex h-11 cursor-pointer items-center gap-3">
                  <input type="checkbox" name="enabled" className="switch" defaultChecked={config.enabled} />
                  <span className="text-sm font-bold text-ink-2">{config.enabled ? t.common.enabled : t.common.disabled}</span>
                </label>
                <p className="hint">{t.admin.backupsEnabledHint}</p>
              </div>
            </div>
            <div className="mt-5 border-t border-line pt-4">
              <SubmitButton className="btn btn-primary btn-sm">{t.common.save}</SubmitButton>
            </div>
          </ActionForm>
        </Section>

        <Section title={t.admin.backupsNowTitle} icon={DatabaseBackup} tone="bg-mint-soft text-mint-ink">
          <div className="space-y-4 p-5">
            <p className="text-sm leading-relaxed text-muted">{t.admin.backupsNowText}</p>
            <ActionButton action={adminAction} fields={{ op: "backup.run" }} confirm={t.admin.backupsNowConfirm} className="btn btn-primary btn-sm">
              <Send className="size-4" />
              {t.admin.backupsNow}
            </ActionButton>
          </div>
        </Section>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Section title={t.admin.backupsLastTitle} icon={FileArchive}>
          <div className="space-y-3 p-5 text-sm">
            {last ? (
              last.ok ? (
                <>
                  <p>
                    ✅ <b>{t.admin.backupsLastOk}</b> — <TimeIso iso={last.at} />
                  </p>
                  <p className="text-muted">{fmt(t.admin.backupsLastMeta, { parts: n(last.parts), mb: (last.bytes / 1048576).toFixed(2) })}</p>
                  <p className="break-all font-mono text-xs text-faint" dir="ltr">
                    sha256: {last.sha256}
                  </p>
                  {last.counts ? (
                    <p className="text-xs text-muted" dir="ltr">
                      {Object.entries(last.counts)
                        .map(([k, v]) => `${k}=${n(v)}`)
                        .join(" · ")}
                    </p>
                  ) : null}
                </>
              ) : (
                <p className="font-semibold text-rose-ink">
                  ❌ <b>{t.admin.backupsLastFail}</b> — {last.error}
                </p>
              )
            ) : (
              <p className="text-muted">{t.admin.backupsLastNone}</p>
            )}
          </div>
        </Section>

        <Section title={t.admin.backupsRestoreTitle} icon={ShieldCheck} tone="bg-amber-soft text-amber-ink">
          <div className="space-y-3 p-5 text-sm leading-relaxed text-muted">
            <p>{t.admin.backupsRestoreText1}</p>
            <ol className="ms-4 list-decimal space-y-1.5">
              <li>{t.admin.backupsRestoreStep1}</li>
              <li>{t.admin.backupsRestoreStep2}</li>
              <li>{t.admin.backupsRestoreStep3}</li>
              <li>{t.admin.backupsRestoreStep4}</li>
            </ol>
            <p className="text-xs text-faint">{t.admin.backupsRestoreNote}</p>
          </div>
        </Section>
      </div>
    </>
  );
}
