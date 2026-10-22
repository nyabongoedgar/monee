/**
 * Web Crypto helpers. No third-party code.
 *
 *   PIN ──PBKDF2──► KEK ──AES-GCM wraps──► DEK (random 256-bit data key)
 *   DEK ──AES-GCM──► every sensitive field in IndexedDB
 *
 * Changing the PIN re-wraps the DEK; no record is re-encrypted.
 */

export const DEFAULT_ITERATIONS = 600_000

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const IV_BYTES = 12

export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return crypto.getRandomValues(new Uint8Array(length))
}

export function toBase64(bytes: Uint8Array): string {
  let binary = ""
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function fromBase64(value: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(Array.from(atob(value), (char) => char.charCodeAt(0)))
}

/** Derives a key-encryption key from a PIN (or any passphrase) with PBKDF2-SHA-256. */
export async function deriveKek(
  secret: string,
  salt: Uint8Array,
  iterations = DEFAULT_ITERATIONS,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"],
  )
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  )
}

/** Turns an arbitrary secret (e.g. a WebAuthn PRF output) into an AES-GCM wrapping key. */
export async function keyFromSecret(
  secret: Uint8Array<ArrayBuffer>,
  info: string,
): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    secret as BufferSource,
    "HKDF",
    false,
    ["deriveKey"],
  )
  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: new Uint8Array(0),
      info: encoder.encode(info),
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  )
}

export function generateDataKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, [
    "encrypt",
    "decrypt",
  ])
}

/** AES-GCM seal: returns iv || ciphertext. Throws if the key is wrong (GCM authentication). */
export async function sealBytes(
  key: CryptoKey,
  plaintext: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer>> {
  const iv = randomBytes(IV_BYTES)
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      plaintext as BufferSource,
    ),
  )
  const out = new Uint8Array(IV_BYTES + cipher.length)
  out.set(iv, 0)
  out.set(cipher, IV_BYTES)
  return out
}

export async function openBytes(
  key: CryptoKey,
  sealed: Uint8Array,
): Promise<Uint8Array> {
  const iv = sealed.slice(0, IV_BYTES)
  const cipher = sealed.slice(IV_BYTES)
  return new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher),
  )
}

/** Wraps the data key under a KEK. Returns base64. */
export async function wrapDataKey(
  dek: CryptoKey,
  kek: CryptoKey,
): Promise<string> {
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", dek))
  return toBase64(await sealBytes(kek, raw))
}

/**
 * Unwraps a data key. Rejects if the KEK is wrong. Stays extractable so it can be
 * re-wrapped (e.g. when enrolling a passkey); it never leaves this page.
 */
export async function unwrapDataKey(
  wrapped: string,
  kek: CryptoKey,
): Promise<CryptoKey> {
  const raw = await openBytes(kek, fromBase64(wrapped))
  return crypto.subtle.importKey(
    "raw",
    raw as BufferSource,
    { name: "AES-GCM" },
    true,
    ["encrypt", "decrypt"],
  )
}

export async function sealJson(
  key: CryptoKey,
  value: unknown,
): Promise<string> {
  return toBase64(await sealBytes(key, encoder.encode(JSON.stringify(value))))
}

export async function openJson<T>(key: CryptoKey, sealed: string): Promise<T> {
  return JSON.parse(
    decoder.decode(await openBytes(key, fromBase64(sealed))),
  ) as T
}
