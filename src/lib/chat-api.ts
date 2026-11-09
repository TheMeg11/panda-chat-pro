import { after } from "next/server";
import type { Room } from "@/db/schema";
import { buildSnapshot, normalizeBody, postMessage, softDeleteMessage, touchMember, type ChatRoomOverride, type Viewer } from "./chat";
import { storeFile } from "./files";
import { maxFileBytes } from "./file-mime";
import { rateLimit } from "./rate-limit";
import { isSameOrigin } from "./request";
import { getRoomById } from "./rooms";
import { getSettings } from "./settings";
import { forwardMessageToTelegram } from "./telegram/service";

export type ChatViewer = Viewer & { authorName: string };

const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "cache-control": "no-store" } });

/** Guard against oversized JSON bodies (maxMessageLength is ~2–10 KB; 256 KB is generous). */
const MAX_JSON_BYTES = 256 * 1024;
/** E2EE envelopes are base64 blobs — allow ~3x the raw limit. */
const MAX_ENVELOPE_BYTES = 96 * 1024;

function bodyTooLarge(req: Request): boolean {
  const len = Number(req.headers.get("content-length") ?? 0);
  return Number.isFinite(len) && len > MAX_JSON_BYTES;
}

function parseVersion(value: unknown): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  return typeof n === "number" && Number.isInteger(n) && n >= 0 ? n : null;
}

export async function chatGet(req: Request, room: Room, viewer: ChatViewer, roomOverride?: ChatRoomOverride) {
  const url = new URL(req.url);
  const afterId = Math.max(0, Number(url.searchParams.get("after") ?? 0) || 0);
  await touchMember(viewer.memberId);
  return json(await buildSnapshot(room, viewer, afterId, parseVersion(url.searchParams.get("v")), roomOverride));
}

export async function chatPost(req: Request, room: Room, viewer: ChatViewer, roomOverride?: ChatRoomOverride) {
  if (!isSameOrigin(req)) return json({ error: "unauthorized" }, 403);
  if (bodyTooLarge(req)) return json({ error: "messageTooLong" }, 413);
  const payload = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const settings = await getSettings();
  const body = normalizeBody(payload?.body);
  const fileId = typeof payload?.fileId === "string" ? payload.fileId : null;
  if (!body && !fileId) return json({ error: "messageEmpty" }, 400);
  if (room.isLocked && viewer.role !== "owner") return json({ error: "roomLocked" }, 403);
  if (!rateLimit(`msg:${viewer.memberId}`, 12, 10_000).ok) return json({ error: "rateLimited" }, 429);

  // E2EE conversations accept ENVELOPES ONLY — the server must never store
  // readable plaintext for an E2EE room, so a non-envelope body is rejected.
  const ENVELOPE_RE = /^e2ee\.v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
  const encrypted = Boolean(room.e2eeEnabled);
  if (encrypted) {
    if (!ENVELOPE_RE.test(body)) return json({ error: "e2eeRequired" }, 400);
    if (body.length > MAX_ENVELOPE_BYTES) return json({ error: "messageTooLong" }, 413);
  } else {
    if (ENVELOPE_RE.test(body)) return json({ error: "badRequest" }, 400); // envelope outside E2EE room
    if (body.length > settings.maxMessageLength) return json({ error: "messageTooLong" }, 400);
    if (body.length > MAX_JSON_BYTES / 4) return json({ error: "messageTooLong" }, 413);
  }

  // Self-destruct: per-send override, else the conversation default.
  const ttlRaw = Number(payload?.ttl);
  const ttl = Number.isSafeInteger(ttlRaw) && ttlRaw > 0 ? Math.min(ttlRaw, 7 * 86_400) : room.defaultTtl ?? null;

  const msg = await postMessage(room, viewer, body, Number(payload?.replyToId) || null, "web", fileId, {
    ttlSeconds: ttl,
    encrypted,
  });
  // E2EE rooms never forward to Telegram — the bot must NOT receive ciphertext
  // it cannot decrypt, and the server must not ship it a decryption oracle.
  if (viewer.role === "guest" && !room.e2eeEnabled) {
    after(() =>
      forwardMessageToTelegram(room.id, msg.id).catch((error) => console.error("[panda-chat] forward failed", error)),
    );
  }
  await touchMember(viewer.memberId);
  const fresh = (await getRoomById(room.id)) ?? room;
  const afterId = Math.max(0, Number(payload?.after) || 0);
  return json(await buildSnapshot(fresh, viewer, afterId, parseVersion(payload?.v), roomOverride));
}

export async function chatDelete(req: Request, room: Room, viewer: ChatViewer) {
  if (!isSameOrigin(req)) return json({ error: "unauthorized" }, 403);
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isSafeInteger(id) || id <= 0) return json({ error: "notFound" }, 400);
  const ok = await softDeleteMessage(room.id, id, viewer.role === "owner" ? undefined : viewer.memberId);
  if (!ok) return json({ error: "notFound" }, 404);
  const fresh = await getRoomById(room.id);
  return json({ ok: true, stateVersion: fresh?.stateVersion ?? room.stateVersion });
}

/**
 * Shared media upload handler. The bytes are validated and stored by lib/files
 * (magic-byte sniffing, hard size cap) and the file becomes attachable to a message
 * in the same room only. Media auto-expires and is deleted by the maintenance loop.
 */
export async function filePost(req: Request, room: Room, viewer: ChatViewer) {
  if (!isSameOrigin(req)) return json({ error: "unauthorized" }, 403);
  const settings = await getSettings();
  if (room.isLocked && viewer.role !== "owner") return json({ error: "roomLocked" }, 403);
  if (!rateLimit(`file:${viewer.memberId}`, 8, 60_000).ok) return json({ error: "rateLimited" }, 429);

  const limit = maxFileBytes();
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.startsWith("multipart/form-data")) return json({ error: "fileInvalid" }, 400);
  const len = Number(req.headers.get("content-length") ?? 0);
  if (Number.isFinite(len) && len > limit + 128 * 1024) return json({ error: "fileTooBig" }, 413);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return json({ error: "fileInvalid" }, 400);
  }
  const file = form.get("file");
  if (!(file instanceof File)) return json({ error: "fileInvalid" }, 400);
  if (file.size > limit) return json({ error: "fileTooBig" }, 413);

  const stored = await storeFile(room.id, viewer.memberId, file);
  if (!stored.ok) return json({ error: stored.error }, stored.error === "fileTooBig" ? 413 : 400);
  return json({ id: stored.file.id, name: stored.file.name, mime: stored.file.mime, size: stored.file.size }, 201);
}

export { json as chatJson };
