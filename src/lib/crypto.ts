import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";

/** URL-safe random token. 32 bytes = 256 bits of entropy (43 chars). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * Constant-time string comparison.
 *
 * AUDIT NOTE (2026 security review): a 146-line audit flagged this helper for
 * "throwing when input lengths differ". That finding is a FALSE POSITIVE — both
 * inputs are hashed with SHA-256 FIRST, so `timingSafeEqual` always receives two
 * fixed-length 32-byte digests and can never throw on length mismatch. The
 * hashing also removes the length-leak side channel. The implementation below
 * only adds defensive type checks (non-strings → false) without changing the
 * proven core.
 */
export function safeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

function scryptAsync(password: string, salt: Buffer, N: number, r: number, p: number, keylen: number) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, keylen, { N, r, p, maxmem: 128 * N * r * 2 }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, SCRYPT.N, SCRYPT.r, SCRYPT.p, SCRYPT.keylen);
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, "base64");
  try {
    const key = await scryptAsync(password, Buffer.from(saltB64, "base64"), Number(n), Number(r), Number(p), expected.length);
    return key.length === expected.length && timingSafeEqual(key, expected);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | null = null;
/** Burn equivalent CPU time for unknown accounts to avoid user enumeration by timing. */
export async function verifyDummyPassword(password: string): Promise<false> {
  dummyHash ??= hashPassword("panda-chat-timing-equalizer");
  await verifyPassword(password, await dummyHash);
  return false;
}

/* ------------------------------------------------------------------ */
/* Secret encryption at rest (Telegram bot tokens, TOTP secrets)       */
/* ------------------------------------------------------------------ */

let warned = false;
function encryptionKey(): Buffer {
  const secret = process.env.APP_SECRET?.trim() || null;
  if (!secret && !warned) {
    warned = true;
    console.warn("[panda-chat] APP_SECRET is not set — using a DEVELOPMENT-ONLY derived key.");
  }
  // NOTE: no more DATABASE_URL fallback. The key is domain-separated via the
  // HMAC label so it can never collide with the backup key (see lib/config.ts).
  const source = secret ?? "panda-chat-dev-secret";
  return createHmac("sha256", Buffer.from("panda-chat:secretbox:v1", "utf8")).update(source, "utf8").digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`;
}

export function decryptSecret(payload: string): string {
  const [v, ivB64, tagB64, encB64] = payload.split(".");
  if (v !== "v1" || !ivB64 || !tagB64 || !encB64) throw new Error("Invalid secret payload");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivB64, "base64url"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encB64, "base64url")), decipher.final()]).toString("utf8");
}
