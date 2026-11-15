import { createHmac, randomInt } from "node:crypto";
import { deriveKey } from "./config";

/**
 * v1.8.0 — built-in math CAPTCHA for the register form.
 *
 * Zero external services, zero state: the challenge is a small arithmetic
 * sum whose answer is not shipped to the browser. Instead the server sends
 * the question plus a signed token = HMAC(question, answer, expiry). The
 * submit posts the token and the user's answer; verification recomputes the
 * HMAC over (token payload + answer) and checks the expiry window.
 *
 * Threat model: stops drive-by mass registration scripts and cheap bots.
 * A determined attacker solves it with one LLM call — that layer is covered
 * by the per-IP register rate limit (10/hour) in registerAction.
 */

const TOKEN_TTL_MS = 15 * 60_000;

export type CaptchaChallenge = {
  /** human question, e.g. "۷ + ۳" or "7 + 3" */
  question: string;
  /** signed, expiring token binding the exact question to its answer */
  token: string;
};

export type CaptchaVerdict = { ok: boolean; expired?: boolean };

/** [2..12] so the answer stays a single small number for everyone. */
const operand = () => randomInt(2, 13);

/** Digits are rendered in the requested locale for the question text. */
const toLocaleDigits = (n: number, fa: boolean): string =>
  fa ? n.toLocaleString("fa-IR") : String(n);

export function makeCaptcha(fa: boolean): CaptchaChallenge {
  const a = operand();
  const b = operand();
  const answer = a + b;
  const expires = Date.now() + TOKEN_TTL_MS;
  // The token binds question + answer + expiry under the APP_SECRET-derived
  // key. Tampering with any part breaks the HMAC on verify.
  const payload = `${a}+${b}.${expires}`;
  const sig = createHmac("sha256", captchaKey()).update(payload).digest("base64url");
  return {
    question: `${toLocaleDigits(a, fa)} + ${toLocaleDigits(b, fa)}`,
    token: `${payload}.${sig}`,
  };
}

export function verifyCaptcha(token: string, userAnswer: string): CaptchaVerdict {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false };
  const [sum, expiresRaw, sig] = parts;
  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || !/^\d+\+\d+$/.test(sum)) return { ok: false };
  if (Date.now() > expires) return { ok: false, expired: true };

  const expected = createHmac("sha256", captchaKey()).update(`${sum}.${expiresRaw}`).digest("base64url");
  if (expected !== sig) return { ok: false };

  // Accept plain ASCII digits and Persian/Arabic digits alike.
  const normalized = userAnswer.trim().replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
  const answer = Number(normalized);
  if (!Number.isInteger(answer)) return { ok: false };

  const [aRaw, bRaw] = sum.split("+");
  return { ok: answer === Number(aRaw) + Number(bRaw) };
}

/** Domain-separated from every other APP_SECRET use (backup keys, etc.). */
function captchaKey(): Buffer {
  const secret = process.env.APP_SECRET && process.env.APP_SECRET.length >= 16 ? process.env.APP_SECRET : "panda-chat-dev-secret";
  return deriveKey(secret, "panda-chat:captcha:v1");
}
