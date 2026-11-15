import { describe, expect, it } from "vitest";
import { makeCaptcha, verifyCaptcha } from "../../src/lib/captcha";

/** v1.8.0 — built-in register CAPTCHA: sign, verify, expiry, tamper. */
describe("register captcha", () => {
  it("accepts the correct answer (ASCII digits)", () => {
    const { question, token } = makeCaptcha(false);
    // The challenge must be a sum the user can actually read.
    expect(question).toMatch(/^\d{1,2} \+ \d{1,2}$/);
    // Recover the operands from the question to compute the answer.
    const [a, b] = question.split("+").map((p) => Number(p.trim()));
    expect(verifyCaptcha(token, String(a + b)).ok).toBe(true);
  });

  it("accepts Persian-digit answers", () => {
    const { question, token } = makeCaptcha(false);
    const [a, b] = question.split("+").map((p) => Number(p.trim()));
    const sum = (a + b).toLocaleString("fa-IR");
    expect(verifyCaptcha(token, sum).ok).toBe(true);
  });

  it("rejects a wrong answer", () => {
    const { token } = makeCaptcha(false);
    expect(verifyCaptcha(token, "999").ok).toBe(false);
  });

  it("rejects garbage tokens and tampered payloads", () => {
    expect(verifyCaptcha("", "5").ok).toBe(false);
    expect(verifyCaptcha("not-a-token", "5").ok).toBe(false);
    // Forge: take a real token, swap the operands in the payload.
    const { token } = makeCaptcha(false);
    const parts = token.split(".");
    const forged = `${parts[0]}1.${parts[1]}.${parts[2]}`;
    expect(verifyCaptcha(forged, "0").ok).toBe(false);
  });

  it("rejects answers signed for a different question", () => {
    const { token } = makeCaptcha(false);
    // Even the RIGHT answer to another challenge must fail: the HMAC binds
    // the exact question.
    const other = makeCaptcha(false);
    const [a, b] = other.question.split("+").map((p) => Number(p.trim()));
    expect(verifyCaptcha(token, String(a + b)).ok).toBe(false);
  });
});
