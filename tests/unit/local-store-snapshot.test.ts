/**
 * v1.5.3 REGRESSION: useLocalJson's getSnapshot used to JSON.parse on every
 * call, returning a NEW object identity each time — useSyncExternalStore
 * compares snapshots with Object.is, so SecurityCard (bound to "pc-vault")
 * re-rendered forever on any device where the vault was set up, crashing the
 * settings page with React error #185 "Maximum update depth exceeded"
 * (the user-visible "error on almost every page" report).
 *
 * The cached snapshot must keep a STABLE identity while the raw string is
 * unchanged, and re-parse only when the raw value actually changes.
 */
import { describe, expect, it } from "vitest";

// minimal localStorage shim (the lib guards with try/catch, but the test needs
// a working store to exercise parse + cache)
const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

import { stableJsonSnapshot } from "@/lib/local-store";

describe("local-store stable JSON snapshots (React #185 regression)", () => {
  it("returns null (stable) when the key is absent", () => {
    expect(stableJsonSnapshot("pc-nothing")).toBeNull();
    expect(stableJsonSnapshot("pc-nothing")).toBe(stableJsonSnapshot("pc-nothing"));
  });

  it("keeps a STABLE identity across calls while the raw value is unchanged", () => {
    store.set("pc-vault", JSON.stringify({ s: "salt", h: "hash", ids: { "a": 1 } }));
    const first = stableJsonSnapshot("pc-vault");
    const second = stableJsonSnapshot("pc-vault");
    expect(first).not.toBeNull();
    // THE regression: these two must be the SAME object (Object.is-equal),
    // otherwise useSyncExternalStore loops forever
    expect(second).toBe(first);
  });

  it("re-parses into a NEW identity only when the raw value changes", () => {
    store.set("pc-vault", JSON.stringify({ s: "v1", h: "a", ids: {} }));
    const before = stableJsonSnapshot("pc-vault"); // parse v1
    store.set("pc-vault", JSON.stringify({ s: "v2", h: "b", ids: {} }));
    const after = stableJsonSnapshot("pc-vault"); // raw changed → re-parse
    expect(after).not.toBe(before);
    expect((after as { s: string }).s).toBe("v2");
    // and the new identity is again stable while raw stays the same
    expect(stableJsonSnapshot("pc-vault")).toBe(after);
  });

  it("returns a stable null for corrupt JSON instead of looping", () => {
    store.set("pc-vault", "{not-json");
    expect(stableJsonSnapshot("pc-vault")).toBeNull();
    expect(stableJsonSnapshot("pc-vault")).toBe(stableJsonSnapshot("pc-vault"));
  });

  it("returns a stable null after the key is removed", () => {
    store.set("pc-vault", JSON.stringify({ ok: true }));
    stableJsonSnapshot("pc-vault");
    store.delete("pc-vault");
    const after = stableJsonSnapshot("pc-vault");
    expect(after).toBeNull();
    expect(after).toBe(stableJsonSnapshot("pc-vault"));
  });
});
