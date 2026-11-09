import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { files } from "@/db/schema";
import { INLINE_MIMES, maxFileBytes, sanitizeFileName, sniffMime } from "./file-mime";

export type StoredFile = {
  id: string;
  name: string;
  mime: string;
  size: number;
};

export type StoreResult = { ok: true; file: StoredFile } | { ok: false; error: "fileTooBig" | "fileInvalid" };

/**
 * Validates and persists an uploaded file (bytes live in Postgres, so they survive
 * redeploys). The MIME type is derived from magic bytes — a client-claimed type is
 * never trusted — and anything that is not a known safe image/audio/video format is
 * stored as application/octet-stream and always served as a forced download.
 * This makes it impossible to upload something the browser would render as HTML/SVG.
 */
export async function storeFile(roomId: string, memberId: string | null, file: File): Promise<StoreResult> {
  const limit = maxFileBytes();
  if (file.size <= 0 || file.size > limit) return { ok: false, error: file.size > limit ? "fileTooBig" : "fileInvalid" };

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length === 0 || buf.length > limit) return { ok: false, error: "fileTooBig" };

  const magic = sniffMime(buf);
  if (!magic) return { ok: false, error: "fileInvalid" };
  const mime = INLINE_MIMES.has(magic) ? magic : "application/octet-stream";
  const name = sanitizeFileName(file.name || "file");

  const [row] = await db
    .insert(files)
    .values({
      roomId,
      memberId,
      name,
      mime,
      size: buf.length,
      data: buf,
      expiresAt: new Date(Date.now() + ttlMs()),
    })
    .returning({ id: files.id, name: files.name, mime: files.mime, size: files.size });

  return { ok: true, file: row };
}

export function ttlMs(): number {
  const hours = Number(process.env.FILES_TTL_HOURS);
  const safe = Number.isFinite(hours) && hours >= 1 ? Math.min(hours, 24 * 30) : 24;
  return safe * 3_600_000;
}

export function newFileId(): string {
  return randomUUID();
}
