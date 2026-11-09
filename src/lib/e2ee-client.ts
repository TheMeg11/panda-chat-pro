"use client";

/**
 * Client-side End-to-End Encryption (E2EE) for direct messages.
 *
 * Design (audited primitives only — NO custom cryptography):
 *  - Identity:    ECDH P-256 keypair generated in the browser (WebCrypto).
 *  - Storage:     public key → server in the clear; private key → server ONLY
 *                 as AES-256-GCM ciphertext wrapped by PBKDF2-SHA256(account
 *                 password, 310k iterations). The server never sees the raw
 *                 private key nor the wrapping key.
 *  - Messages:    per-message AES-256-GCM with a fresh 96-bit IV, key derived
 *                 via HKDF-SHA256 from the ECDH shared secret + room id salt.
 *  - Envelope:    `e2ee.v1.<iv-b64url>.<ct-b64url>` stored in messages.body.
 *
 * Multi-device: because the private key is wrapped with the account password,
 * any device where the user can log in can unwrap the SAME private key.
 *
 * Limitations (documented in docs/SECURITY.md): metadata (author name,
 * timestamps, reply graph) stays visible to the server; message search and
 * Telegram forwarding are disabled for E2EE conversations; pre-E2EE history
 * remains server-readable plaintext.
 */

export const E2EE_VERSION = 1;
export const E2EE_PBKDF2_ITERATIONS = 310_000;
const E2EE_STORAGE_PREFIX = "pc-e2ee";

export type E2eeIdentity = {
  publicKeyJwk: JsonWebKey;
  wrappedPrivateKey: string; // base64url(iv).base64url(ct)
  kdfSalt: string; // base64url
  kdfIterations: number;
  keyVersion: number;
};

export type Envelope = { v: number; iv: string; ct: string };

/* ------------------------------------------------------------------ */
/* Low-level helpers                                                    */
/* ------------------------------------------------------------------ */

const b64 = {
  encode(buf: ArrayBuffer | Uint8Array): string {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  decode(s: string): Uint8Array {
    const norm = s.replace(/-/g, "+").replace(/_/g, "/").replace(/=+$/, "");
    const raw = atob(norm);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  },
};

function subtle(): SubtleCrypto {
  if (!globalThis.crypto?.subtle) throw new Error("WebCrypto unavailable (needs HTTPS or localhost)");
  return globalThis.crypto.subtle;
}

/* ------------------------------------------------------------------ */
/* Identity: generate / wrap / unwrap                                   */
/* ------------------------------------------------------------------ */

/** Typed helper: WebCrypto BufferSource accepts only ArrayBuffer-backed views. */
function buf(bytes: Uint8Array): ArrayBuffer {
  if (bytes.buffer instanceof ArrayBuffer && bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength) {
    return bytes.buffer;
  }
  const out = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(out).set(bytes);
  return out;
}

export async function generateIdentity(password: string): Promise<E2eeIdentity> {
  const pair = await subtle().generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveKey", "deriveBits"]);
  const publicKeyJwk = await subtle().exportKey("jwk", pair.publicKey);
  const privateKeyJwk = await subtle().exportKey("jwk", pair.privateKey);

  const kdfSalt = crypto.getRandomValues(new Uint8Array(16));
  const iterations = E2EE_PBKDF2_ITERATIONS;
  const wrapKey = await subtle().deriveKey(
    { name: "PBKDF2", salt: buf(kdfSalt), iterations, hash: "SHA-256" },
    await importRawPassword(password),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle().encrypt(
    { name: "AES-GCM", iv: buf(iv) },
    wrapKey,
    new TextEncoder().encode(JSON.stringify(privateKeyJwk)),
  );
  return {
    publicKeyJwk,
    wrappedPrivateKey: `${b64.encode(iv)}.${b64.encode(ct)}`,
    kdfSalt: b64.encode(kdfSalt),
    kdfIterations: iterations,
    keyVersion: E2EE_VERSION,
  };
}

async function importRawPassword(password: string): Promise<CryptoKey> {
  return subtle().importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey", "deriveBits"]);
}

export async function unwrapPrivateKey(identity: E2eeIdentity, password: string): Promise<CryptoKey> {
  const [ivB64, ctB64] = identity.wrappedPrivateKey.split(".");
  if (!ivB64 || !ctB64) throw new Error("Corrupt wrapped key");
  const wrapKey = await subtle().deriveKey(
    {
      name: "PBKDF2",
      salt: buf(b64.decode(identity.kdfSalt)),
      iterations: identity.kdfIterations || E2EE_PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    await importRawPassword(password),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  const plain = await subtle().decrypt({ name: "AES-GCM", iv: buf(b64.decode(ivB64)) }, wrapKey, buf(b64.decode(ctB64)));
  const jwk = JSON.parse(new TextDecoder().decode(plain)) as JsonWebKey;
  return subtle().importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
}

/* ------------------------------------------------------------------ */
/* Conversation key (ECDH + HKDF)                                       */
/* ------------------------------------------------------------------ */

async function conversationKey(privateKey: CryptoKey, peerPublicKeyJwk: JsonWebKey, roomId: string): Promise<CryptoKey> {
  const peerKey = await subtle().importKey("jwk", peerPublicKeyJwk, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = await subtle().deriveBits({ name: "ECDH", public: peerKey }, privateKey, 256);
  const hkdfKey = await subtle().importKey("raw", shared, "HKDF", false, ["deriveKey"]);
  const salt = new TextEncoder().encode(`panda-chat:e2ee:room:${roomId}`);
  return subtle().deriveKey(
    { name: "HKDF", hash: "SHA-256", salt, info: new TextEncoder().encode("dm") },
    hkdfKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/* ------------------------------------------------------------------ */
/* Message envelopes                                                    */
/* ------------------------------------------------------------------ */

export function isEnvelope(body: string): boolean {
  return parseEnvelope(body) !== null;
}

export function parseEnvelope(body: string): Envelope | null {
  const parts = body.split(".");
  if (parts.length !== 4 || parts[0] !== "e2ee" || parts[1] !== "v1") return null;
  return { v: 1, iv: parts[2], ct: parts[3] };
}

export async function encryptMessage(
  privateKey: CryptoKey,
  peerPublicKeyJwk: JsonWebKey,
  roomId: string,
  plaintext: string,
): Promise<string> {
  const key = await conversationKey(privateKey, peerPublicKeyJwk, roomId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle().encrypt({ name: "AES-GCM", iv: buf(iv) }, key, new TextEncoder().encode(plaintext));
  return `e2ee.v1.${b64.encode(iv)}.${b64.encode(ct)}`;
}

export async function decryptMessage(
  privateKey: CryptoKey,
  peerPublicKeyJwk: JsonWebKey,
  roomId: string,
  body: string,
): Promise<string> {
  const env = parseEnvelope(body);
  if (!env) throw new Error("Not an E2EE envelope");
  const key = await conversationKey(privateKey, peerPublicKeyJwk, roomId);
  const plain = await subtle().decrypt({ name: "AES-GCM", iv: buf(b64.decode(env.iv)) }, key, buf(b64.decode(env.ct)));
  return new TextDecoder().decode(plain);
}

/* ------------------------------------------------------------------ */
/* File encryption (same conversation key, per-file IV)                 */
/* ------------------------------------------------------------------ */

export async function encryptFile(
  privateKey: CryptoKey,
  peerPublicKeyJwk: JsonWebKey,
  roomId: string,
  bytes: ArrayBuffer,
): Promise<{ blob: Blob; iv: string }> {
  const key = await conversationKey(privateKey, peerPublicKeyJwk, roomId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle().encrypt({ name: "AES-GCM", iv: buf(iv) }, key, bytes);
  return { blob: new Blob([ct], { type: "application/octet-stream" }), iv: b64.encode(iv) };
}

export async function decryptFile(
  privateKey: CryptoKey,
  peerPublicKeyJwk: JsonWebKey,
  roomId: string,
  iv: string,
  ciphertext: ArrayBuffer,
): Promise<Blob> {
  const key = await conversationKey(privateKey, peerPublicKeyJwk, roomId);
  const plain = await subtle().decrypt({ name: "AES-GCM", iv: buf(b64.decode(iv)) }, key, ciphertext);
  return new Blob([plain]);
}

/** Metadata (original filename + mime) travels INSIDE the encrypted message body. */
export function buildFileMetadata(name: string, mime: string, iv: string): string {
  return JSON.stringify({ __file: { name: name.slice(0, 190), mime: mime.slice(0, 90), iv } });
}

/* ------------------------------------------------------------------ */
/* Session-scoped unlock state                                          */
/* ------------------------------------------------------------------ */

/**
 * The unwrapped private key lives in sessionStorage (never localStorage) under
 * a random handle, so it disappears with the tab. Keys are cached per room.
 */
const unlocked = new Map<string, { privateKey: CryptoKey; peerPublicKeyJwk: JsonWebKey }>();

export function cacheUnlocked(roomId: string, privateKey: CryptoKey, peerPublicKeyJwk: JsonWebKey) {
  unlocked.set(roomId, { privateKey, peerPublicKeyJwk });
}

export function getUnlocked(roomId: string): { privateKey: CryptoKey; peerPublicKeyJwk: JsonWebKey } | null {
  return unlocked.get(roomId) ?? null;
}

export function clearUnlocked(roomId?: string) {
  if (roomId) unlocked.delete(roomId);
  else unlocked.clear();
}

export const E2EE_STORAGE_KEY = `${E2EE_STORAGE_PREFIX}-unlocked-at`;
