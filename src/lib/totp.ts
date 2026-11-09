import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * RFC 6238 TOTP (Time-based One-Time Password) with HMAC-SHA1, 6 digits,
 * 30-second period — compatible with Google Authenticator, Aegis, 1Password,
 * Authy and every standard authenticator app.
 *
 * The window parameter accepts ±1 step of clock drift (90 seconds total),
 * and every code is single-use via the `lastUsedStep` guard stored by callers.
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/** RFC 4648 base32 encode (no padding). */
export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

/** RFC 4648 base32 decode (padding and lowercase tolerated). */
export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error(`Invalid base32 character: ${char}`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** Generates a fresh 160-bit TOTP secret, base32-encoded. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

const PERIOD = 30;
const DIGITS = 6;

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 0x100000000), 0);
  buf.writeUInt32BE(counter % 0x100000000, 4);
  const digest = createHmac("sha1", secret).update(buf).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(code % 10 ** DIGITS).padStart(DIGITS, "0");
}

/** Current 30s step (unix time / 30). */
export function currentStep(now = Date.now()): number {
  return Math.floor(now / 1000 / PERIOD);
}

/**
 * Verifies a 6-digit TOTP code with ±1 step drift tolerance.
 * Returns the matched step (for single-use tracking) or null.
 */
export function verifyTotp(secretBase32: string, code: string, window = 1, now = Date.now()): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const secret = base32Decode(secretBase32);
  const step = currentStep(now);
  const input = Buffer.from(code, "ascii");
  for (let drift = -window; drift <= window; drift++) {
    const candidate = Buffer.from(hotp(secret, step + drift), "ascii");
    if (input.length === candidate.length && timingSafeEqual(input, candidate)) return step + drift;
  }
  return null;
}

/** otpauth:// URI that authenticator apps scan as a QR code. */
export function otpauthUrl(secretBase32: string, account: string, issuer = "Panda Chat"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: "SHA1",
    digits: String(DIGITS),
    period: String(PERIOD),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/* ------------------------------------------------------------------ */
/* Recovery codes                                                       */
/* ------------------------------------------------------------------ */

const RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I

/** 10 single-use recovery codes, human-readable (e.g. "K7M2-QP9X-..."). */
export function generateRecoveryCodes(count = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const bytes = randomBytes(10);
    let raw = "";
    for (const b of bytes) raw += RECOVERY_ALPHABET[b % RECOVERY_ALPHABET.length];
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5, 10)}`);
  }
  return codes;
}

/** Normalizes user input of a recovery code (case, separators, whitespace). */
export function normalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "");
}
