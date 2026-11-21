"use server";

import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { recoveryCodes as recoveryCodesTable, sessions, users } from "@/db/schema";
import { audit } from "@/lib/audit";
import { hashPassword, sha256 } from "@/lib/crypto";
import { rateLimitDistributed } from "@/lib/rate-limit";
import { requestMeta } from "@/lib/request";
import { normalizeRecoveryCode } from "@/lib/totp";
import type { ActionState } from "@/lib/utils";

/**
 * Password reset with a SIGNUP RECOVERY CODE (v2.6.0, web-only).
 *
 * The 10 one-time codes are generated and shown exactly once at signup
 * (v2.5.0 B-07). Typing one here — together with the username and a fresh
 * password — signs the account out of every session and sets the new
 * password. The old Telegram 6-digit-code flow was removed together with the
 * bot; the anti-enumeration posture stays: a wrong code and an unknown
 * username produce the same generic error, and every attempt is rate-limited.
 */

const USERNAME_RE = /^[a-z0-9_.]{3,32}$/;

export async function confirmPasswordResetAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const username = String(formData.get("username") ?? "").trim().toLowerCase();
  const code = String(formData.get("code") ?? "").trim();
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const meta = await requestMeta();
  if (!(await rateLimitDistributed(`pwreset-confirm:${meta.ip}`, 20, 60 * 60_000)).ok) return { error: "rateLimited" };

  if (!USERNAME_RE.test(username)) return { error: "resetCodeInvalid" };
  const normalized = normalizeRecoveryCode(code);
  if (normalized.length < 8) return { error: "resetCodeInvalid" };
  if (newPassword.length < 8 || newPassword.length > 200) return { error: "passwordShort" };
  if (newPassword !== confirm) return { error: "passwordMismatch" };

  const invalid = (): ActionState => ({ error: "resetCodeInvalid" });

  const [user] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
  if (!user) return invalid();

  const [recovery] = await db
    .update(recoveryCodesTable)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(recoveryCodesTable.userId, user.id),
        eq(recoveryCodesTable.codeHash, sha256(normalized)),
        isNull(recoveryCodesTable.usedAt),
      ),
    )
    .returning({ id: recoveryCodesTable.id });
  if (!recovery) return invalid();

  await setNewPasswordAndRevoke(user.id, newPassword);
  await audit("auth.password_reset", { actor: username, targetType: "user", targetId: user.id, details: "password reset via signup recovery code" });
  return { ok: true, message: "auth.resetDone" };
}

/** Shared final step: set the new hash and revoke EVERY session. */
async function setNewPasswordAndRevoke(userId: string, newPassword: string): Promise<void> {
  await db.update(users).set({ passwordHash: await hashPassword(newPassword) }).where(eq(users.id, userId));
  await db.delete(sessions).where(eq(sessions.userId, userId));
}
