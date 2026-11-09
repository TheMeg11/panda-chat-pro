"use client";

import { sha256Hex } from "./vault-hash";

/**
 * Client-side vault for hidden chats.
 *
 * Hidden room ids and the PIN verifier live in localStorage on THIS device only —
 * the server keeps no notion of "hidden". The PIN is stored as a salted SHA-256
 * hash, never in plain text. This is a privacy/UX gate for shared devices, not
 * server-side access control.
 */
export const VAULT_KEY = "pc-vault";
export type Vault = {
  /** base64url salt */
  s: string;
  /** sha256(salt + ":" + pin) hex */
  h: string;
  /** roomId → ISO date hidden */
  ids: Record<string, string>;
};

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
    return { s: v.s, h: v.h, ids: v.ids };
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

export function hiddenRoomIds(): string[] {
  const v = readVault();
  return v ? Object.keys(v.ids) : [];
}

export function isRoomHidden(roomId: string): boolean {
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

export function vaultHasPin(): boolean {
  const v = readVault();
  return Boolean(v?.h);
}

export async function setPin(pin: string): Promise<void> {
  const v = readVault() ?? { s: b64urlSalt(), h: "", ids: {} };
  v.h = await sha256Hex(`${v.s}:${pin}`);
  writeVault(v);
}

export async function checkPin(pin: string): Promise<boolean> {
  const v = readVault();
  if (!v?.h) return false;
  const hash = await sha256Hex(`${v.s}:${pin}`);
  return hash === v.h;
}
