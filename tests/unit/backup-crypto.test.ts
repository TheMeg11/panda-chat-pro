import { describe, expect, it } from "vitest";
import {
  BACKUP_ENC_MAGIC,
  backupKeyFingerprint,
  decryptBackup,
  deriveBackupKey,
  encryptBackup,
  isEncryptedBackup,
  packBackupJson,
  unpackBackupBytes,
} from "@/lib/backup-crypto";
import { gunzipSync } from "node:zlib";

const KEY = deriveBackupKey("a-test-backup-secret-of-32-characters!");

describe("backup encryption (AES-256-GCM, format v4)", () => {
  it("derives a 32-byte domain-separated key", () => {
    const key = deriveBackupKey("secret");
    expect(key).toHaveLength(32);
    // Different from a raw sha256 of the same secret (domain separation).
    expect(key.toString("hex")).not.toBe(
      Buffer.from("secret").toString("hex").padEnd(64, "0").slice(0, 64),
    );
  });

  it("derives DIFFERENT keys for different labels", () => {
    const backup = deriveBackupKey("same-secret");
    const other = deriveBackupKey("same-secret", ); // same input, same fn → same key
    expect(backup).toEqual(other);
  });

  it("round-trips a gzipped archive", () => {
    const { gz } = packBackupJson({ app: "panda-chat-backup", version: 4, tables: { users: [] } });
    const enc = encryptBackup(KEY, gz);
    expect(isEncryptedBackup(enc)).toBe(true);
    const back = decryptBackup(KEY, enc);
    expect(gunzipSync(back).toString("utf8")).toContain("panda-chat-backup");
  });

  it("marks the envelope with the PCENC1 magic header", () => {
    const { gz } = packBackupJson({ x: 1 });
    const enc = encryptBackup(KEY, gz);
    expect(enc.subarray(0, 6)).toEqual(BACKUP_ENC_MAGIC);
    expect(enc[6]).toBe(1); // version byte
  });

  it("never equals the plaintext (real encryption, not obfuscation)", () => {
    const { gz } = packBackupJson({ secret: "hunter2" });
    const enc = encryptBackup(KEY, gz);
    expect(enc.includes(gz)).toBe(false);
    expect(enc.includes("hunter2")).toBe(false);
  });

  it("rejects a wrong key (GCM tag mismatch)", () => {
    const { gz } = packBackupJson({ a: 1 });
    const enc = encryptBackup(KEY, gz);
    const wrongKey = deriveBackupKey("another-wrong-secret");
    expect(() => decryptBackup(wrongKey, enc)).toThrow();
  });

  it("rejects tampered ciphertext", () => {
    const { gz } = packBackupJson({ a: 1 });
    const enc = encryptBackup(KEY, gz);
    enc[enc.length - 20] ^= 0xff;
    expect(() => decryptBackup(KEY, enc)).toThrow();
  });

  it("detects encrypted vs legacy gzip archives", () => {
    const { gz } = packBackupJson({ legacy: true });
    expect(isEncryptedBackup(gz)).toBe(false);
    expect(isEncryptedBackup(encryptBackup(KEY, gz))).toBe(true);
    expect(isEncryptedBackup(Buffer.from("tiny"))).toBe(false);
  });

  it("unpacks legacy plaintext gzip archives unchanged (restore compatibility)", () => {
    const payload = { app: "panda-chat-backup", version: 3, tables: {} };
    const { gz } = packBackupJson(payload);
    expect(unpackBackupBytes(gz)).toEqual(payload);
  });

  it("refuses to unpack an encrypted archive without a key", () => {
    const { gz } = packBackupJson({ x: 1 });
    const enc = encryptBackup(KEY, gz);
    expect(() => unpackBackupBytes(enc)).toThrow(/key required/i);
  });

  it("shows a stable, short key fingerprint for admins", () => {
    expect(backupKeyFingerprint(KEY)).toMatch(/^[a-f0-9]{16}$/);
    expect(backupKeyFingerprint(KEY)).toBe(backupKeyFingerprint(KEY));
    expect(backupKeyFingerprint(deriveBackupKey("other"))).not.toBe(backupKeyFingerprint(KEY));
  });
});
