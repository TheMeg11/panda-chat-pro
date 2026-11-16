import { describe, expect, it } from "vitest";

/** The bot sends `panda-backup-<stamp>.pcbak[.enc]`; restore must accept BOTH shapes. */
const PCBAK_RE = /\.pcbak(\.enc)?$/i;

describe("backup filename acceptance", () => {
  it("accepts the encrypted single-file name the bot sends", () => {
    expect(PCBAK_RE.test("panda-backup-20261116-030000.pcbak.enc")).toBe(true);
  });
  it("accepts plain v3 archives", () => {
    expect(PCBAK_RE.test("panda-backup-20261115-030000.pcbak")).toBe(true);
  });
  it("accepts multi-part names", () => {
    expect(PCBAK_RE.test("panda-backup-20261116-030000.part1of2.pcbak.enc")).toBe(true);
  });
  it("rejects everything else", () => {
    for (const bad of ["virus.exe", "backup.zip", "photo.jpg", "notes.pcbak.txt", "pcbak"]) {
      expect(PCBAK_RE.test(bad)).toBe(false);
    }
  });
});
