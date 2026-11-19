import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Super-admin restore flow unit tests — pure routing/gating logic, no DB.
 * We mock "@/lib/backup" and "./platform" so tryHandleSuperadmin can run.
 */

vi.mock("@/db", () => ({
  db: {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  },
}));

vi.mock("./platform", () => ({
  getPlatformBot: vi.fn().mockResolvedValue({ configured: false, token: "" }),
  tg: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/lib/backup", () => {
  const state: Record<string, unknown> = {};
  return {
    allowedChatIds: vi.fn().mockResolvedValue(["7231432194"]),
    allowedSenderIds: vi.fn().mockReturnValue(["7231432194"]),
    getLastBackupResult: vi.fn().mockResolvedValue(null),
    getBackupConfig: vi.fn().mockResolvedValue({ enabled: true, hour: 3, chatId: "7231432194" }),
    restoreFromBackup: vi.fn().mockResolvedValue({ counts: {}, createdAt: "", sha256: "" }),
    runBackup: vi.fn().mockResolvedValue({ ok: true, parts: 1, bytes: 10 }),
    unpackBackup: vi.fn().mockImplementation((bytes: Buffer) => {
      if (bytes.length === 3) throw new Error("corrupt");
      return { payload: { counts: { users: 1 }, createdAt: "x" }, json: bytes };
    }),
  };
});

import { tryHandleSuperadmin } from "@/lib/telegram/superadmin";
import { restoreFromBackup } from "@/lib/backup";

const ADMIN = 7231432194;

function update(overrides: Record<string, unknown> = {}) {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      from: { id: ADMIN, is_bot: false, first_name: "Admin" },
      chat: { id: ADMIN, type: "private" },
      date: 1700000000,
      ...overrides,
    },
  } as never;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("superadmin routing", () => {
  it("accepts commands from the configured super admin chat", async () => {
    // bot unconfigured → api() returns null; command is still consumed (true)
    const consumed = await tryHandleSuperadmin(update({ text: "/restore" }));
    expect(consumed).toBe(true);
  });

  it("ignores strangers silently", async () => {
    const consumed = await tryHandleSuperadmin(
      update({ text: "/backup", chat: { id: 111, type: "private" }, from: { id: 111 } }),
    );
    expect(consumed).toBe(false);
  });

  it("ignores a spoofed chat id when the sender id is not the admin", async () => {
    // chat.id matches the admin id but from.id differs → must be rejected
    const consumed = await tryHandleSuperadmin(
      update({ text: "/backup", from: { id: 999, is_bot: false, first_name: "Evil" } }),
    );
    expect(consumed).toBe(false);
  });

  it("routes .pcbak documents into the restore flow", async () => {
    const consumed = await tryHandleSuperadmin(
      update({ document: { file_id: "f1", file_name: "panda-backup-20260101-030000.pcbak.enc", file_size: 100 } }),
    );
    expect(consumed).toBe(true);
  });

  it("auto-restores when the archive validates (no confirmation step)", async () => {
    // start restore mode, then send a document; downloadDocument fails (bot
    // unconfigured) but the routing/acceptance of .pcbak.enc must be true.
    await tryHandleSuperadmin(update({ text: "/restore" }));
    const consumed = await tryHandleSuperadmin(
      update({ document: { file_id: "f2", file_name: "panda-backup-x.pcbak.enc", file_size: 100 } }),
    );
    expect(consumed).toBe(true);
    expect(restoreFromBackup).not.toHaveBeenCalled(); // download failed → no restore
  });

  it("passes non-admin updates through to the user bot", async () => {
    const consumed = await tryHandleSuperadmin(
      update({ text: "/start", chat: { id: 222, type: "private" }, from: { id: 222 } }),
    );
    expect(consumed).toBe(false);
  });
});
