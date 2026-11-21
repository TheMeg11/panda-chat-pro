import { getAdminBase, getAdminSession } from "@/lib/admin-auth";
import { buildBackupArchive, restoreFromBackup } from "@/lib/backup";

export const dynamic = "force-dynamic";

/**
 * Web-based backup endpoints (v2.6.0), Super Admin session required.
 *
 *  GET  → streams ONE encrypted .pcbak.enc archive as a download.
 *  POST → uploads a previously downloaded archive and restores it.
 *
 * Nothing runs on a schedule — an archive exists only when an administrator
 * clicks Download, which is the whole point of the web-only design.
 */
export async function GET() {
  if (!(await getAdminSession())) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const archive = await buildBackupArchive();
    return new Response(new Uint8Array(archive.bytes), {
      headers: {
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename="${archive.filename}"`,
        "content-length": String(archive.bytes.length),
        "x-backup-sha256": archive.sha256,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error("[panda-chat] backup download failed", error);
    return Response.json({ error: "generic" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!(await getAdminSession())) return Response.json({ error: "unauthorized" }, { status: 401 });
  const base = await getAdminBase();
  const back = (params: string) => Response.redirect(new URL(`${base}/backup${params}`, req.url), 303);

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.startsWith("multipart/form-data")) return back("?restore=badrequest");
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return back("?restore=badrequest");
  }
  const upload = form.get("file");
  if (!(upload instanceof File) || upload.size === 0) return back("?restore=badrequest");
  if (upload.size > 512 * 1024 * 1024) return back("?restore=toobig");

  try {
    const bytes = Buffer.from(await upload.arrayBuffer());
    const summary = await restoreFromBackup(bytes);
    return back(`?restore=ok&users=${summary.counts.users ?? 0}&rooms=${summary.counts.rooms ?? 0}`);
  } catch (error) {
    console.error("[panda-chat] backup restore failed", error);
    const detail = encodeURIComponent((error as Error).message.slice(0, 120));
    return back(`?restore=failed&detail=${detail}`);
  }
}
