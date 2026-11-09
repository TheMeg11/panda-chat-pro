import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

/**
 * Encrypted backup envelope (format v4).
 *
 * Layout:  magic(6) "PCENC1" | version(1) | iv(12) | ciphertext | tag(16)
 * The ciphertext is AES-256-GCM over the gzipped backup JSON. AAD binds the
 * magic + version so the header cannot be tampered with.
 *
 * The key comes from BACKUP_ENCRYPTION_KEY (recommended: kept OUT of Telegram
 * and the server env — e.g. printed and stored offline) or is derived from
 * APP_SECRET with a domain-separated label so it is never equal to any other
 * key the app uses. Key rotation: set BACKUP_ENCRYPTION_KEY — old archives
 * stay decryptable only with the old key, which is why the admin should keep
 * retired keys offline.
 */

export const BACKUP_ENC_MAGIC = Buffer.from("PCENC1", "ascii");
export const BACKUP_ENC_VERSION = 1;
const MAGIC_LEN = 6;

export function deriveBackupKey(secret: string): Buffer {
  // HKDF-style: HMAC-SHA256(label, secret) — domain-separated from APP_SECRET uses.
  return createHmac("sha256", Buffer.from("panda-chat:backup:v1", "utf8")).update(secret, "utf8").digest();
}

/** Encrypts a gzipped archive buffer into the PCENC1 envelope. */
export function encryptBackup(key: Buffer, gz: Buffer): Buffer {
  if (key.length !== 32) throw new Error("Backup key must be 32 bytes");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.concat([BACKUP_ENC_MAGIC, Buffer.from([BACKUP_ENC_VERSION])]));
  const ct = Buffer.concat([cipher.update(gz), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([BACKUP_ENC_MAGIC, Buffer.from([BACKUP_ENC_VERSION]), iv, ct, tag]);
}

/** Detects the PCENC1 envelope (file on disk may also be legacy plaintext gzip). */
export function isEncryptedBackup(bytes: Buffer): boolean {
  return bytes.length > MAGIC_LEN + 1 + 12 + 16 && bytes.subarray(0, MAGIC_LEN).equals(BACKUP_ENC_MAGIC);
}

/** Decrypts a PCENC1 envelope back into the gzipped archive bytes. */
export function decryptBackup(key: Buffer, envelope: Buffer): Buffer {
  if (key.length !== 32) throw new Error("Backup key must be 32 bytes");
  if (!isEncryptedBackup(envelope)) throw new Error("This backup is not encrypted (PCENC1 header missing)");
  const version = envelope[MAGIC_LEN];
  if (version !== BACKUP_ENC_VERSION) throw new Error(`Unknown encrypted backup version ${version}`);
  const iv = envelope.subarray(MAGIC_LEN + 1, MAGIC_LEN + 1 + 12);
  const tag = envelope.subarray(envelope.length - 16);
  const ct = envelope.subarray(MAGIC_LEN + 1 + 12, envelope.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(Buffer.concat([BACKUP_ENC_MAGIC, Buffer.from([version])]));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]);
}

/* ------------------------------------------------------------------ */
/* Round-trip helpers (used by the backup pipeline AND the unit tests)  */
/* ------------------------------------------------------------------ */

export function packBackupJson(payload: unknown): { json: Buffer; gz: Buffer } {
  const json = Buffer.from(JSON.stringify(payload), "utf8");
  return { json, gz: gzipSync(json, { level: 6 }) };
}

export function unpackBackupBytes(bytes: Buffer): unknown {
  let gz = bytes;
  if (isEncryptedBackup(bytes)) throw new Error("Encrypted backup: key required (use decryptBackup first)");
  const json = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(gz) : bytes;
  return JSON.parse(json.toString("utf8"));
}

/** Constant-time key fingerprint shown to admins so they can verify their offline key. */
export function backupKeyFingerprint(key: Buffer): string {
  return createHmac("sha256", Buffer.from("panda-chat:backup:fingerprint", "utf8"))
    .update(key.toString("base64"))
    .digest("hex")
    .slice(0, 16);
}
