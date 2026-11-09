import { describe, expect, it } from "vitest";
import { checkPin, hiddenRoomIds, hideRoom, isRoomHidden, panicClearVault, setDecoyPin, setPin, unlockVault, vaultHasPin, writeVault, readVault, setPanicMode, panicModeEnabled, lockVault, vaultMode } from "@/lib/vault";
import { afterEach, beforeEach } from "vitest";

/** localStorage / sessionStorage shims for the node test env. */
beforeEach(() => {
  const store = new Map<string, string>();
  // @ts-expect-error -- partial DOM shim
  globalThis.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
  const session = new Map<string, string>();
  // @ts-expect-error -- partial DOM shim
  globalThis.sessionStorage = {
    getItem: (k: string) => session.get(k) ?? null,
    setItem: (k: string, v: string) => void session.set(k, v),
    removeItem: (k: string) => void session.delete(k),
  };
});

afterEach(() => {
  // @ts-expect-error -- cleanup shim
  delete globalThis.localStorage;
  // @ts-expect-error -- cleanup shim
  delete globalThis.sessionStorage;
});

const ROOM = "11111111-1111-4111-8111-111111111111";

describe("hidden chat vault", () => {
  it("hides and unhides rooms locally", () => {
    hideRoom(ROOM);
    expect(isRoomHidden(ROOM)).toBe(true);
    expect(hiddenRoomIds()).toContain(ROOM);
  });

  it("requires a PIN to be set before unlock works", async () => {
    hideRoom(ROOM);
    expect(vaultHasPin()).toBe(false);
    expect(await unlockVault("1234")).toBeNull(); // nothing to unlock yet (no hash)
  });
});

describe("decoy PIN (§4.3)", () => {
  it("real PIN unlocks the real vault", async () => {
    hideRoom(ROOM);
    await setPin("9999");
    const result = await unlockVault("9999");
    expect(result).toEqual({ mode: "real", panicked: false });
    expect(vaultMode()).toBe("real");
    expect(hiddenRoomIds()).toContain(ROOM);
  });

  it("decoy PIN unlocks an EMPTY view (nothing hints at hidden chats)", async () => {
    hideRoom(ROOM);
    await setPin("9999");
    await setDecoyPin("0000");
    lockVault();
    const result = await unlockVault("0000");
    expect(result).toEqual({ mode: "decoy", panicked: false });
    // In decoy mode NOTHING is hidden — because "nothing exists".
    expect(hiddenRoomIds()).toEqual([]);
    expect(isRoomHidden(ROOM)).toBe(false);
  });

  it("wrong PIN is simply wrong (no hint about a second PIN)", async () => {
    await setPin("9999");
    await setDecoyPin("0000");
    expect(await unlockVault("4321")).toBeNull();
  });
});

describe("panic mode (§4.3)", () => {
  it("decoy PIN + panic mode WIPES the vault", async () => {
    hideRoom(ROOM);
    await setPin("9999");
    await setDecoyPin("0000");
    setPanicMode(true);
    expect(panicModeEnabled()).toBe(true);

    const result = await unlockVault("0000");
    expect(result).toEqual({ mode: "decoy", panicked: true });
    // The vault is GONE: no pin, no hidden ids, no mode.
    expect(readVault()).toBeNull();
    expect(vaultHasPin()).toBe(false);
    expect(vaultMode()).toBeNull();
  });

  it("real PIN with panic mode still unlocks normally", async () => {
    hideRoom(ROOM);
    await setPin("9999");
    await setDecoyPin("0000");
    setPanicMode(true);
    const result = await unlockVault("9999");
    expect(result).toEqual({ mode: "real", panicked: false });
    expect(hiddenRoomIds()).toContain(ROOM);
  });

  it("panicClearVault destroys everything on demand", () => {
    hideRoom(ROOM);
    writeVault(readVault());
    expect(panicClearVault()).toBe(true);
    expect(readVault()).toBeNull();
    expect(panicClearVault()).toBe(false); // second call: nothing left
  });
});
