import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Webhook mode (cost tier C) — the platform-bot registration path.
 * DB + Telegram are mocked; only the decision logic runs for real.
 */

vi.mock("@/lib/settings", () => ({
  getSettings: vi.fn(async () => ({
    registrationOpen: true,
    maintenanceMode: false,
    announcement: "",
    defaultMaxRooms: 20,
    maxMessageLength: 2000,
    telegramEnabled: true,
    telegramPaid: true,
    publicUrl: "",
  })),
}));

const tgMock = vi.fn(async (_token: string, _method: string, _payload?: Record<string, unknown>) => ({}));

vi.mock("@/lib/telegram/platform", () => ({
  tg: (...args: unknown[]) => tgMock(...(args as [string, string, Record<string, unknown>])),
  getPlatformBot: vi.fn(async () => ({
    configured: true,
    source: "db" as const,
    token: "123456789:TEST-TOKEN",
    botUsername: "panda_test_bot",
    botName: "Panda",
    botId: "1",
    hint: "1:••••OKEN",
    lastError: null,
  })),
  TelegramError: class extends Error {
    code = 0;
  },
}));

vi.mock("@/lib/telegram/service", () => ({
  BOT_COMMANDS: [{ command: "start", description: "Start" }],
  handleUpdate: vi.fn(),
}));

vi.mock("@/lib/telegram/superadmin", () => ({
  registerAdminCommands: vi.fn(async () => undefined),
  tryHandleSuperadmin: vi.fn(async () => false),
}));

import {
  ensurePlatformWebhook,
  ensureWebhookMode,
  publicBaseUrl,
  webhookModeEnabled,
} from "@/lib/telegram/webhook";

const ENV_KEYS = ["TELEGRAM_POLLING", "WEBHOOK_SECRET", "APP_URL"] as const;

describe("platform-bot webhook mode (cost tier C, 2026-11-21)", () => {
  beforeEach(() => {
    tgMock.mockClear();
    tgMock.mockResolvedValue({});
    for (const k of ENV_KEYS) delete process.env[k];
  });

  afterEach(() => {
    for (const k of ENV_KEYS) delete process.env[k];
  });

  it("is off unless TELEGRAM_POLLING=off", () => {
    expect(webhookModeEnabled()).toBe(false);
    process.env.TELEGRAM_POLLING = "off";
    expect(webhookModeEnabled()).toBe(true);
  });

  it("refuses to register while polling is still enabled", async () => {
    const result = await ensurePlatformWebhook();
    expect(result.ok).toBe(false);
    expect(result.error).toBe("polling-mode");
    expect(tgMock).not.toHaveBeenCalled();
  });

  it("refuses to register without a usable WEBHOOK_SECRET", async () => {
    process.env.TELEGRAM_POLLING = "off";
    const result = await ensurePlatformWebhook();
    expect(result.ok).toBe(false);
    expect(result.error).toBe("missing-secret");
    expect(tgMock).not.toHaveBeenCalled();
  });

  it("refuses to register without an https public base URL", async () => {
    process.env.TELEGRAM_POLLING = "off";
    process.env.WEBHOOK_SECRET = "s".repeat(32);
    const result = await ensurePlatformWebhook();
    expect(result.ok).toBe(false);
    expect(result.error).toBe("no-public-url");
    expect(tgMock).not.toHaveBeenCalled();
  });

  it("registers with the exact URL + secret + allowed updates", async () => {
    process.env.TELEGRAM_POLLING = "off";
    process.env.WEBHOOK_SECRET = "super-secret-value-32-chars!!";
    process.env.APP_URL = "https://chat.kanar.ir";
    const result = await ensurePlatformWebhook();
    expect(result.ok).toBe(true);
    expect(result.url).toBe("https://chat.kanar.ir/api/telegram/webhook/platform");
    const call = tgMock.mock.calls.find((c) => c[1] === "setWebhook");
    expect(call).toBeDefined();
    expect(call?.[2]).toMatchObject({
      url: "https://chat.kanar.ir/api/telegram/webhook/platform",
      secret_token: "super-secret-value-32-chars!!",
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: false,
    });
  });

  it("prefers the admin-configured publicUrl over APP_URL", async () => {
    process.env.TELEGRAM_POLLING = "off";
    process.env.WEBHOOK_SECRET = "s".repeat(32);
    process.env.APP_URL = "https://from-env.example.com";
    expect(await publicBaseUrl()).toBe("https://from-env.example.com");
  });

  it("surfaces setWebhook failures without throwing", async () => {
    process.env.TELEGRAM_POLLING = "off";
    process.env.WEBHOOK_SECRET = "s".repeat(32);
    process.env.APP_URL = "https://chat.kanar.ir";
    tgMock.mockRejectedValueOnce(new Error("Telegram is down"));
    const result = await ensurePlatformWebhook();
    expect(result.ok).toBe(false);
    expect(result.error).toBe("setWebhook failed");
  });

  it("ensureWebhookMode wires __pcPollerSync so token changes re-register", async () => {
    process.env.TELEGRAM_POLLING = "off";
    process.env.WEBHOOK_SECRET = "s".repeat(32);
    process.env.APP_URL = "https://chat.kanar.ir";
    // vitest globally sets NEXT_PHASE=phase-production-build (loop guard);
    // the boot hook must run in its real-runtime mode here.
    const phase = process.env.NEXT_PHASE;
    delete process.env.NEXT_PHASE;
    const g = globalThis as typeof globalThis & { __pcPollerSync?: () => void };
    const before = g.__pcPollerSync;
    try {
      ensureWebhookMode();
      expect(typeof g.__pcPollerSync).toBe("function");
      g.__pcPollerSync?.(); // re-registration path (token change) must not throw
      await new Promise((resolve) => setTimeout(resolve, 0)); // let the boot registration settle
      expect(tgMock.mock.calls.some((c) => c[1] === "setWebhook")).toBe(true);
    } finally {
      process.env.NEXT_PHASE = phase;
      g.__pcPollerSync = before;
    }
  });

  it("does nothing in polling mode (the poller owns __pcPollerSync)", () => {
    const g = globalThis as typeof globalThis & { __pcPollerSync?: () => void };
    const before = g.__pcPollerSync;
    ensureWebhookMode();
    expect(g.__pcPollerSync).toBe(before);
    expect(tgMock).not.toHaveBeenCalled();
  });
});
