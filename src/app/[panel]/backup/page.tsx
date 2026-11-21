import { Download, FileArchive, ShieldCheck, TriangleAlert, Upload } from "lucide-react";
import { PageHeader, Section } from "@/components/admin/parts";
import { getAdminBase, getAdminSession, isAdminSlug } from "@/lib/admin-auth";
import { backupKeyHint, getLastBackupResult } from "@/lib/backup";
import { formatNumber } from "@/lib/i18n";
import { getI18n } from "@/lib/i18n-server";
import { fmt } from "@/lib/utils";

export const dynamic = "force-dynamic";

function TimeIso({ iso }: { iso: string }) {
  return (
    <time dateTime={iso}>
      {new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Tehran", dateStyle: "medium", timeStyle: "short" })}
    </time>
  );
}

export default async function AdminBackups({ params, searchParams }: { params: Promise<{ panel: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { panel } = await params;
  if (!isAdminSlug(panel) || !(await getAdminSession())) return null;
  const base = await getAdminBase(); // panel works on both the secret path and the dedicated admin host
  const { t, lang } = await getI18n();
  const n = (v: number) => formatNumber(v, lang);
  const last = await getLastBackupResult();
  const restore = String((await searchParams).restore ?? "");
  const restoreUsers = Number((await searchParams).users ?? 0) || 0;
  const restoreRooms = Number((await searchParams).rooms ?? 0) || 0;
  const restoreDetail = String((await searchParams).detail ?? "");

  return (
    <>
      <PageHeader title={t.admin.backupsTitle} subtitle={t.admin.backupsSubtitle} />

      {restore === "ok" ? (
        <div className="notice notice-mint mb-6">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          <span>{fmt(t.admin.backupsRestoreDone, { users: n(restoreUsers), rooms: n(restoreRooms) })}</span>
        </div>
      ) : null}
      {restore === "failed" || restore === "badrequest" || restore === "toobig" ? (
        <div className="notice notice-rose mb-6">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <span>
            {t.admin.backupsRestoreFail}
            {restoreDetail ? ` — ${restoreDetail}` : ""}
          </span>
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Section title={t.admin.backupsDownloadTitle} icon={Download} tone="bg-mint-soft text-mint-ink" className="lg:col-span-2">
          <div className="space-y-4 p-5">
            <p className="text-sm leading-relaxed text-muted">{t.admin.backupsDownloadText}</p>
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2 p-3 text-xs">
              <span className="badge badge-mint">AES-256-GCM</span>
              <span className="text-faint" dir="ltr">
                key <span className="font-mono">{backupKeyHint()}</span>
              </span>
            </div>
            <a href={`${base}/api/admin/backup`} className="btn btn-primary btn-sm w-fit" download>
              <Download className="size-4" />
              {t.admin.backupsDownload}
            </a>
            <p className="hint">{t.admin.backupsDownloadHint}</p>
          </div>
        </Section>

        <Section title={t.admin.backupsLastTitle} icon={FileArchive}>
          <div className="space-y-3 p-5 text-sm">
            {last ? (
              last.ok ? (
                <>
                  <p>
                    ✅ <b>{t.admin.backupsLastOk}</b> — <TimeIso iso={last.at} />
                  </p>
                  <p className="text-muted">{fmt(t.admin.backupsLastMeta, { mb: (last.bytes / 1048576).toFixed(2) })}</p>
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
      </div>

      <div className="mt-6">
        <Section title={t.admin.backupsRestoreTitle} icon={Upload} tone="bg-amber-soft text-amber-ink">
          <form action={`${base}/api/admin/backup`} method="post" encType="multipart/form-data" className="space-y-4 p-5">
            <p className="text-sm leading-relaxed text-muted">{t.admin.backupsRestoreText1}</p>
            <ol className="ms-4 list-decimal space-y-1.5 text-sm text-muted">
              <li>{t.admin.backupsRestoreStep1}</li>
              <li>{t.admin.backupsRestoreStep2}</li>
              <li>{t.admin.backupsRestoreStep3}</li>
            </ol>
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="file"
                name="file"
                required
                accept=".pcbak,.pcbak.enc,.enc,application/octet-stream"
                className="file:btn file:btn-secondary file:btn-sm file:me-3 text-sm text-muted"
              />
              <button type="submit" className="btn btn-danger btn-sm">
                <Upload className="size-4" />
                {t.admin.backupsRestoreUpload}
              </button>
            </div>
            <p className="notice notice-amber text-xs">{t.admin.backupsRestoreNote}</p>
          </form>
        </Section>
      </div>
    </>
  );
}
