/**
 * Optional biometric unlock via WebAuthn with the PRF extension.
 *
 * Biometric data never reaches this code: the OS checks the user and returns only
 * success or failure. The PRF output is a secret only the authenticator can
 * produce, and it wraps the data key. Without PRF support, biometrics aren't offered.
 */
import { db } from "@/db/schema"
import type { PasskeyInfo } from "@/db/types"
import {
  fromBase64,
  keyFromSecret,
  openBytes,
  randomBytes,
  sealBytes,
  toBase64,
} from "./crypto"

const RP_NAME = "monee"
const WRAP_INFO = "monee-dek-prf-v1"

type PrfResults = { prf?: { results?: { first?: ArrayBuffer } } }

export async function biometricsAvailable(): Promise<boolean> {
  if (
    typeof window === "undefined" ||
    !window.PublicKeyCredential ||
    !navigator.credentials
  )
    return false
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

interface PrfOutcome {
  credentialId: Uint8Array<ArrayBuffer>
  secret: Uint8Array<ArrayBuffer>
}

/** Creates a platform credential and reads its PRF secret (falling back to an assertion if create() doesn't return one). */
async function createWithPrf(
  prfSalt: Uint8Array<ArrayBuffer>,
): Promise<PrfOutcome | null> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: { name: RP_NAME, id: location.hostname },
      user: { id: randomBytes(16), name: "monee-user", displayName: "monee" },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },
      extensions: { prf: { eval: { first: prfSalt } } },
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null
  if (!cred) return null
  const credentialId = new Uint8Array(cred.rawId)
  const fromCreate = (cred.getClientExtensionResults() as PrfResults).prf
    ?.results?.first
  if (fromCreate) return { credentialId, secret: new Uint8Array(fromCreate) }
  // Many authenticators only return PRF output on assertion, so ask once more.
  const secret = await assertWithPrf(credentialId, prfSalt)
  return secret ? { credentialId, secret } : null
}

async function assertWithPrf(
  credentialId: Uint8Array<ArrayBuffer> | null,
  prfSalt: Uint8Array<ArrayBuffer>,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const assertion = (await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      rpId: location.hostname,
      allowCredentials: credentialId
        ? [{ type: "public-key", id: credentialId }]
        : [],
      userVerification: "required",
      extensions: { prf: { eval: { first: prfSalt } } },
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null
  const output = assertion
    ? (assertion.getClientExtensionResults() as PrfResults).prf?.results?.first
    : undefined
  return output ? new Uint8Array(output) : null
}

/**
 * Registers a platform passkey and wraps the data key with its PRF secret. Throws if PRF is unsupported.
 * Does not store anything: the caller saves the result with storePasskey (or as part of onboarding).
 */
export async function enrollPasskey(dek: CryptoKey): Promise<PasskeyInfo> {
  const prfSalt = randomBytes(32)
  const outcome = await createWithPrf(prfSalt)
  if (!outcome)
    throw new Error(
      "Biometric unlock is not supported on this device or browser.",
    )

  const kek = await keyFromSecret(outcome.secret, WRAP_INFO)
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", dek))
  const info: PasskeyInfo = {
    credentialId: toBase64(outcome.credentialId),
    prfSalt: toBase64(prfSalt),
    wrappedDekByPrf: toBase64(await sealBytes(kek, raw)),
  }
  return info
}

/** Saves a passkey enrolled with enrollPasskey onto the existing security record. */
export async function storePasskey(info: PasskeyInfo): Promise<void> {
  await db.security.update("sec", { passkey: info })
}

/** Unlocks with the platform passkey. Returns null if cancelled or unsupported, so the PIN stays available. */
export async function unlockWithPasskey(): Promise<CryptoKey | null> {
  const info = (await db.security.get("sec"))?.passkey
  if (!info) return null
  try {
    const secret = await assertWithPrf(
      fromBase64(info.credentialId),
      fromBase64(info.prfSalt),
    )
    if (!secret) return null
    const kek = await keyFromSecret(secret, WRAP_INFO)
    const raw = await openBytes(kek, fromBase64(info.wrappedDekByPrf))
    return crypto.subtle.importKey(
      "raw",
      raw as BufferSource,
      { name: "AES-GCM" },
      true,
      ["encrypt", "decrypt"],
    )
  } catch {
    return null
  }
}

export async function removePasskey(): Promise<void> {
  await db.security.update("sec", { passkey: undefined })
}
