import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { recoveryCodes, twoFactor } from "@/db/schema";
import { decryptSecret, encryptSecret, randomToken, sha256 } from "./crypto";
import { generateRecoveryCodes, generateTotpSecret, normalizeRecoveryCode, verifyTotp } from "./totp";

/**
 * Two-factor authentication service layer.
 *
 *  - TOTP secrets are stored AES-256-GCM encrypted (APP_SECRET-derived key).
 *  - Recovery codes are stored as sha256 hashes and are strictly single-use
 *    (marked used atomically inside the verification transaction).
 *  - Verification attempts are rate-limited by the calling actions.
 */

export type TwoFactorState = {
  /** a row exists */
  configured: boolean;
  /** enabledAt set → login requires a code */
  enabled: boolean;
};

export async function getTwoFactorState(userId: string): Promise<TwoFactorState> {
  const [row] = await db.select().from(twoFactor).where(eq(twoFactor.userId, userId)).limit(1);
  return { configured: Boolean(row), enabled: Boolean(row?.enabledAt) };
}

export async function is2faEnabled(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ enabledAt: twoFactor.enabledAt })
    .from(twoFactor)
    .where(eq(twoFactor.userId, userId))
    .limit(1);
  return Boolean(row?.enabledAt);
}

/** Step 1 of enrollment: generate + persist a PENDING secret, return it for QR display. */
export async function beginEnrollment(userId: string): Promise<{ secret: string }> {
  const secret = generateTotpSecret();
  await db
    .insert(twoFactor)
    .values({ userId, secretEncrypted: encryptSecret(secret), enabledAt: null })
    .onConflictDoUpdate({
      target: twoFactor.userId,
      set: { secretEncrypted: encryptSecret(secret), enabledAt: null, updatedAt: new Date() },
    });
  return { secret };
}

/** Step 2 of enrollment: verify the code from the authenticator, then activate + mint recovery codes. */
export async function confirmEnrollment(userId: string, code: string): Promise<{ ok: boolean; recoveryCodes?: string[] }> {
  const [row] = await db.select().from(twoFactor).where(eq(twoFactor.userId, userId)).limit(1);
  if (!row) return { ok: false };
  const secret = decryptSecret(row.secretEncrypted);
  if (verifyTotp(secret, code) === null) return { ok: false };

  const codes = generateRecoveryCodes(10);
  await db.transaction(async (tx) => {
    await tx.update(twoFactor).set({ enabledAt: new Date(), updatedAt: new Date() }).where(eq(twoFactor.userId, userId));
    await tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId));
    await tx.insert(recoveryCodes).values(codes.map((c) => ({ userId, codeHash: sha256(c) })));
  });
  return { ok: true, recoveryCodes: codes };
}

/** Secure disable: requires a valid current TOTP code (or an unused recovery code). */
export async function disable2fa(userId: string, code: string): Promise<boolean> {
  const [row] = await db.select().from(twoFactor).where(eq(twoFactor.userId, userId)).limit(1);
  if (!row) return false;
  const secret = decryptSecret(row.secretEncrypted);
  const totpOk = verifyTotp(secret, code) !== null;
  const recoveryOk = totpOk ? false : await tryUseRecoveryCode(userId, code);
  if (!totpOk && !recoveryOk) return false;
  await db.transaction(async (tx) => {
    await tx.delete(twoFactor).where(eq(twoFactor.userId, userId));
    await tx.delete(recoveryCodes).where(eq(recoveryCodes.userId, userId));
  });
  return true;
}

/**
 * Login step 2: verify TOTP or a recovery code.
 * TOTP codes are single-use per step (blocks replay inside the drift window).
 */
export async function verifyLogin2fa(userId: string, code: string): Promise<boolean> {
  const [row] = await db.select().from(twoFactor).where(eq(twoFactor.userId, userId)).limit(1);
  if (!row?.enabledAt) return false;
  const secret = decryptSecret(row.secretEncrypted);

  const trimmed = code.trim();
  if (/^\d{6}$/.test(trimmed)) {
    const step = verifyTotp(secret, trimmed);
    if (step === null) return false;
    // Single-use: reject if this exact step was already consumed.
    const markerKey = `2fa-step:${userId}`;
    const { rateLimit } = await import("./rate-limit");
    if (!rateLimit(`${markerKey}:${step}`, 1, 120_000).ok) return false;
    return true;
  }

  return tryUseRecoveryCode(userId, normalizeRecoveryCode(trimmed));
}

/** Atomically consumes one unused recovery code. */
async function tryUseRecoveryCode(userId: string, normalized: string): Promise<boolean> {
  if (!normalized) return false;
  const hash = sha256(normalized);
  const rows = await db
    .update(recoveryCodes)
    .set({ usedAt: new Date() })
    .where(and(eq(recoveryCodes.userId, userId), eq(recoveryCodes.codeHash, hash), isNull(recoveryCodes.usedAt)))
    .returning({ id: recoveryCodes.id });
  return rows.length > 0;
}

/* ------------------------------------------------------------------ */
/* Pre-auth tokens (between password check and 2FA step)                */
/* ------------------------------------------------------------------ */

const PREAUTH_TTL_MS = 5 * 60_000;

function preauthKey(): Buffer {
  const secret = process.env.APP_SECRET?.trim() || "panda-chat-dev-secret";
  return createHmac("sha256", "panda-chat:preauth:v1").update(secret, "utf8").digest();
}

/** Short-lived HMAC-signed token that ONLY unlocks the 2FA verification step. */
export function issuePreAuthToken(userId: string): string {
  const payload = Buffer.from(
    JSON.stringify({ u: userId, e: Date.now() + PREAUTH_TTL_MS, n: randomToken(8) }),
    "utf8",
  );
  const sig = createHmac("sha256", preauthKey()).update(payload).digest("base64url");
  return `${payload.toString("base64url")}.${sig}`;
}

export function verifyPreAuthToken(token: string): string | null {
  const [payloadB64, sig] = token.split(".");
  if (!payloadB64 || !sig) return null;
  let payload: Buffer;
  try {
    payload = Buffer.from(payloadB64, "base64url");
  } catch {
    return null;
  }
  const expected = createHmac("sha256", preauthKey()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(payload.toString("utf8")) as { u?: string; e?: number };
    if (!data.u || typeof data.e !== "number" || data.e < Date.now()) return null;
    return data.u;
  } catch {
    return null;
  }
}
