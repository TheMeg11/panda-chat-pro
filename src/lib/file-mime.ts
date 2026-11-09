/**
 * File-type safety helpers.
 *
 * Uploads are validated by their magic bytes, not by the client-declared MIME type.
 * Only formats browsers render safely as <img>/<video>/<audio> may be served inline;
 * everything else is downloaded as application/octet-stream, which permanently rules
 * out stored XSS via HTML/SVG uploads or content-type confusion.
 */

/** MIME types that may be rendered inline in the browser. */
export const INLINE_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "video/mp4",
  "video/webm",
  "audio/mpeg",
  "audio/ogg",
  "audio/wav",
  "audio/mp4",
  "audio/webm",
]);

export function maxFileBytes(): number {
  const mb = Number(process.env.FILES_MAX_MB);
  const safe = Number.isFinite(mb) && mb >= 1 ? Math.min(mb, 64) : 15;
  return Math.round(safe * 1024 * 1024);
}

/** Detects the real type of a buffer by magic bytes. Returns null for unknown data. */
export function sniffMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;

  // JPEG
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  // PNG
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  // GIF87a / GIF89a
  if (buf.subarray(0, 3).toString("latin1") === "GIF") return "image/gif";
  // WEBP: RIFF....WEBP
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  // AVIF / HEIF container: ....ftypavif (also av01)
  if (buf.subarray(4, 8).toString("latin1") === "ftyp") {
    const brand = buf.subarray(8, 12).toString("latin1");
    if (brand.startsWith("avif") || brand.startsWith("avis")) return "image/avif";
    if (brand.startsWith("M4A") || brand.startsWith("M4B")) return "audio/mp4";
    // Any other ISO-BMFF brand is treated as MP4 video (isom, mp42, dash, ...)
    return "video/mp4";
  }
  // MKV/WebM: EBML header
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return "video/webm";
  // OGG
  if (buf.subarray(0, 4).toString("latin1") === "OggS") return "audio/ogg";
  // WAV: RIFF....WAVE
  if (buf.subarray(0, 4).toString("latin1") === "RIFF" && buf.subarray(8, 12).toString("latin1") === "WAVE") return "audio/wav";
  // MP3: ID3 tag or frame sync
  if (buf.subarray(0, 3).toString("latin1") === "ID3") return "audio/mpeg";
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return "audio/mpeg";
  // PDF (download-only, but kept recognizable for logging)
  if (buf.subarray(0, 4).toString("latin1") === "%PDF") return "application/octet-stream";
  // ZIP family (docx, xlsx, apk, zip) — download-only
  if (buf[0] === 0x50 && buf[1] === 0x4b && (buf[2] === 0x03 || buf[2] === 0x05 || buf[2] === 0x07)) return "application/octet-stream";
  // Plain text heuristics — download-only
  if (isMostlyText(buf)) return "application/octet-stream";

  return null;
}

function isMostlyText(buf: Buffer): boolean {
  const sample = buf.subarray(0, 4096);
  let suspicious = 0;
  for (const byte of sample) {
    if (byte === 0) return false;
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20)) suspicious += 1;
  }
  return suspicious / Math.max(1, sample.length) < 0.05;
}

/** Strips paths, control characters and overlong names; never empty. */
export function sanitizeFileName(name: string): string {
  const base = name
    // remove any directory component (both separators)
    .split(/[/\\]/)
    .pop() ?? "";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/^[.\s]+/, "")
    .trim()
    .slice(0, 180);
  return cleaned || "file";
}

export function asciiFallbackName(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return ascii || "file";
}
