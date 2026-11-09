"use client";

import { sha256Hex } from "./vault-hash";

/**
 * Client-side vault for hidden chats — now with DECOY PIN and PANIC MODE.
 *
 * Hidden room ids and PIN verifiers live in localStorage on THIS device only —
 * the server keeps no notion of "hidden". PINs are stored as salted SHA-256
 * hashes, never in plain text. This is a privacy/UX gate for shared devices,
 * not server-side access control.
 *
 * Decoy PIN (§4.3): the vault stores TWO hashes — the real PIN and an optional
 * decoy PIN. Unlocking with the decoy PIN switches the whole UI into "clean"
 * mode: hiddenRoomIds() returns [], the vault list shows "no hidden chats",
 * and nothing hints that a second PIN exists.
 *
 * Panic mode: when enabled, unlocking with the DECOY PIN also wipes the vault
 * from this device entirely (and the caller locks the session). If someone
 * forces you to unlock, the decoy PIN destroys the evidence instead of
 * revealing it.
 *
 * Unlock state lives in sessionStorage (dies with the tab) so a decoy session
 * never leaks into a new tab.
 */

export const VAULT_KEY = "pc-vault";
const VAULT_MODE_KEY = "pc-vault-mode";

export type Vault = {
  /** base64url salt */
  s: string;
  /** sha256(salt + ":" + realPin) hex */
  h: string;
  /** sha256(salt + ":" + decoyPin) hex — unset until a decoy PIN is configured */
  d?: string;
  /** roomId → ISO date hidden */
  ids: Record<string, string>;
  /** panic mode: decoy unlock wipes the vault */
  panic?: boolean;
};

export type VaultMode = "real" | "decoy";

function b64urlSalt(bytes = 16): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return btoa(String.fromCharCode(...arr)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function readVault(): Vault | null {
  try {
    const raw = localStorage.getItem(VAULT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Vault;
    if (!v || typeof v.s !== "string" || typeof v.h !== "string" || typeof v.ids !== "object" || v.ids === null) return null;
    return { s: v.s, h: v.h, d: v.d, ids: v.ids, panic: v.panic };
  } catch {
    return null;
  }
}

export function writeVault(v: Vault | null) {
  try {
    if (v) localStorage.setItem(VAULT_KEY, JSON.stringify(v));
    else localStorage.removeItem(VAULT_KEY);
  } catch {
    /* storage unavailable */
  }
}

/* ------------------------------------------------------------------ */
/* Unlock state (session-scoped)                                        */
/* ------------------------------------------------------------------ */

export function vaultMode(): VaultMode | null {
  try {
    const mode = sessionStorage.getItem(VAULT_MODE_KEY);
    return mode === "real" || mode === "decoy" ? mode : null;
  } catch {
    return null;
  }
}

export function lockVault() {
  try {
    sessionStorage.removeItem(VAULT_MODE_KEY);
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* Hidden-room visibility (decoy-aware)                                 */
/* ------------------------------------------------------------------ */

export function hiddenRoomIds(): string[] {
  if (vaultMode() === "decoy") return []; // clean environment — nothing is hidden because "nothing exists"
  const v = readVault();
  return v ? Object.keys(v.ids) : [];
}

export function isRoomHidden(roomId: string): boolean {
  if (vaultMode() === "decoy") return false;
  const v = readVault();
  return Boolean(v && roomId in v.ids);
}

export function hideRoom(roomId: string) {
  const v = readVault() ?? { s: b64urlSalt(), h: "", ids: {} };
  v.ids[roomId] = new Date().toISOString();
  writeVault(v);
}

export function unhideRoom(roomId: string) {
  const v = readVault();
  if (!v) return;
  delete v.ids[roomId];
  if (Object.keys(v.ids).length === 0) writeVault(null);
  else writeVault(v);
}

/* ------------------------------------------------------------------ */
/* PIN management                                                       */
/* ------------------------------------------------------------------ */

export function vaultHasPin(): boolean {
  const v = readVault();
  return Boolean(v?.h);
}

export function hasDecoyPin(): boolean {
  const v = readVault();
  return Boolean(v?.d);
}

export function panicModeEnabled(): boolean {
  const v = readVault();
  return Boolean(v?.panic);
}

export async function setPin(pin: string): Promise<void> {
  const v = readVault() ?? { s: b64urlSalt(), h: "", ids: {} };
  v.h = await sha256Hex(`${v.s}:${pin}`);
  writeVault(v);
}

/** Sets or clears (empty string) the decoy PIN. */
export async function setDecoyPin(pin: string | null): Promise<void> {
  const v = readVault();
  if (!v) return;
  if (pin && pin.length >= 4) v.d = await sha256Hex(`${v.s}:${pin}`);
  else delete v.d;
  writeVault(v);
}

export function setPanicMode(enabled: boolean): void {
  const v = readVault();
  if (!v) return;
  if (enabled) v.panic = true;
  else delete v.panic;
  writeVault(v);
}

/**
 * Checks a PIN against BOTH hashes without revealing which one matched.
 * Returns the mode, or null when the PIN is wrong.
 */
export async function checkPin(pin: string): Promise<VaultMode | null> {
  const v = readVault();
  if (!v?.h) return null;
  const hash = await sha256Hex(`${v.s}:${pin}`);
  if (hash === v.h) return "real";
  if (v.d && hash === v.d) return "decoy";
  return null;
}

/**
 * Full unlock: verifies the PIN, records the mode for this tab and — when
 * panic mode is on and the DECOY pin was used — wipes the vault from the
 * device. Returns what happened so the UI can lock the session too.
 */
export async function unlockVault(pin: string): Promise<{ mode: VaultMode; panicked: boolean } | null> {
  const mode = await checkPin(pin);
  if (!mode) return null;
  if (mode === "decoy") {
    const v = readVault();
    if (v?.panic) {
      // PANIC: destroy the local vault (hidden ids + hashes) immediately.
      writeVault(null);
      lockVault();
      return { mode, panicked: true };
    }
  }
  try {
    sessionStorage.setItem(VAULT_MODE_KEY, mode);
  } catch {
    /* ignore */
  }
  return { mode, panicked: false };
}

/** Emergency local wipe — usable from the settings page or a keyboard shortcut. */
export function panicClearVault(): boolean {
  const existed = readVault() !== null;
  writeVault(null);
  lockVault();
  try {
    sessionStorage.removeItem("pc-e2ee-unlocked-at");
  } catch {
    /* ignore */
  }
  return existed;
}
