import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  currentStep,
  generateRecoveryCodes,
  generateTotpSecret,
  normalizeRecoveryCode,
  otpauthUrl,
  verifyTotp,
} from "@/lib/totp";
import { createHmac } from "node:crypto";

/** RFC 6238 reference vectors (SHA1, 8 digits) trimmed to the last 6 digits. */
function rfc6238Code(secretBase32: string, step: number): string {
  const key = base32Decode(secretBase32);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(step / 0x100000000), 0);
  buf.writeUInt32BE(step % 0x100000000, 4);
  const digest = createHmac("sha1", key).update(buf).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    ((digest[offset] & 0x7f) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(code % 10 ** 6).padStart(6, "0");
}

const RFC_SECRET = base32Encode(Buffer.from("12345678901234567890", "ascii")); // canonical test secret

describe("base32", () => {
  it("round-trips bytes", () => {
    const data = Buffer.from("hello panda chat pro", "utf8");
    expect(base32Decode(base32Encode(data))).toEqual(data);
  });

  it("decodes the canonical alphabet (prefix — full blocks carry extra bits)", () => {
    const decoded = base32Decode("JBSWY3DPEHPK3PXP");
    expect(decoded.subarray(0, 6).toString("utf8")).toBe("Hello!");
    expect(decoded).toHaveLength(10); // 16 base32 chars = 80 bits = 10 bytes
  });

  it("throws on invalid characters", () => {
    expect(() => base32Decode("1O0I")).toThrow();
  });
});

describe("TOTP (RFC 6238)", () => {
  it("accepts the code for the current step", () => {
    const now = 1_700_000_000_000; // fixed time
    const step = currentStep(now);
    const code = rfc6238Code(RFC_SECRET, step);
    expect(verifyTotp(RFC_SECRET, code, 0, now)).toBe(step);
  });

  it("accepts ±1 step of drift", () => {
    const now = 1_700_000_000_000;
    const step = currentStep(now);
    const drifted = rfc6238Code(RFC_SECRET, step - 1);
    expect(verifyTotp(RFC_SECRET, drifted, 1, now)).toBe(step - 1);
  });

  it("rejects codes outside the drift window", () => {
    const now = 1_700_000_000_000;
    const step = currentStep(now);
    const far = rfc6238Code(RFC_SECRET, step - 2);
    expect(verifyTotp(RFC_SECRET, far, 1, now)).toBeNull();
  });

  it("rejects malformed codes", () => {
    expect(verifyTotp(RFC_SECRET, "12345")).toBeNull();
    expect(verifyTotp(RFC_SECRET, "abcdef")).toBeNull();
    expect(verifyTotp(RFC_SECRET, "")).toBeNull();
  });

  it("generates valid 160-bit secrets", () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    const code = rfc6238Code(secret, currentStep());
    expect(verifyTotp(secret, code, 0)).toBe(currentStep());
  });

  it("builds a Google-Authenticator-compatible otpauth URL", () => {
    const url = otpauthUrl("JBSWY3DPEHPK3PXP", "sara");
    expect(url).toBe("otpauth://totp/Panda%20Chat%3Asara?secret=JBSWY3DPEHPK3PXP&issuer=Panda+Chat&algorithm=SHA1&digits=6&period=30");
  });
});

describe("recovery codes", () => {
  it("generates the requested count of unique codes", () => {
    const codes = generateRecoveryCodes(10);
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) expect(code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
  });

  it("excludes ambiguous characters (0/O/1/I)", () => {
    const codes = generateRecoveryCodes(50).join("");
    expect(codes).not.toMatch(/[0O1I]/);
  });

  it("normalizes user input (case, separators, spaces)", () => {
    expect(normalizeRecoveryCode(" k7m2-qp9x ")).toBe("K7M2QP9X");
    expect(normalizeRecoveryCode("K7M2.QP9X")).toBe("K7M2QP9X");
  });
});
