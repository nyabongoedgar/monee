import { db } from "@/db/schema"
import type { SecurityMeta } from "@/db/types"
import {
  DEFAULT_ITERATIONS,
  deriveKek,
  generateDataKey,
  randomBytes,
  toBase64,
  unwrapDataKey,
  wrapDataKey,
  fromBase64,
} from "./crypto"

export const PIN_LENGTH = 4

/**
 * [TEST] Master PIN. Only active when the build sets VITE_TEST_MASTER_PIN=true.
 * A real release must build without it (scripts/check-release.mjs enforces this).
 */
export const MASTER_PIN = "0000"
export const MASTER_PIN_ENABLED =
  import.meta.env.VITE_TEST_MASTER_PIN === "true"

/** Back-off after repeated failures: none for the first 4, then 30 s, 1 min, 5 min, 15 min, 30 min, 1 h. */
const BACKOFF_STEPS_SEC = [30, 60, 300, 900, 1800, 3600]
export function backoffSeconds(failures: number): number {
  if (failures < 5) return 0
  return BACKOFF_STEPS_SEC[Math.min(failures - 5, BACKOFF_STEPS_SEC.length - 1)]
}

export type UnlockResult = { ok: true; dek: CryptoKey } | {
  ok: false
  reason: "wrong" | "locked-out"
  retryInSec?: number
  attemptsLeft?: number
}

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)
}

export async function getSecurity(): Promise<SecurityMeta | undefined> {
  return db.security.get("sec")
}

/**
 * First-run setup, step 1 of 2. Builds the security record but does not save it.
 * It is saved last in onboarding (see saveSecurity), so an interrupted setup leaves
 * no PIN record behind and the next launch starts onboarding again.
 */
export async function buildSecurity(
  pin: string,
): Promise<{ dek: CryptoKey; meta: SecurityMeta }> {
  const dek = await generateDataKey()
  const salt = randomBytes(16)
  const kek = await deriveKek(pin, salt)
  const meta: SecurityMeta = {
    id: "sec",
    salt: toBase64(salt),
    iterations: DEFAULT_ITERATIONS,
    wrappedDek: await wrapDataKey(dek, kek),
    lockAfterSec: 30,
    failedAttempts: 0,
    lockedUntil: null,
  }
  Object.assign(meta, await masterWrapFields(dek))
  return { dek, meta }
}

/** Setup, step 2 of 2: writes the security record. */
export async function saveSecurity(meta: SecurityMeta): Promise<void> {
  await db.security.put(meta)
}

/** [TEST] Builds the master-PIN wrap fields for a data key. Empty unless the build enables the master PIN. */
async function masterWrapFields(
  dek: CryptoKey,
): Promise<Pick<SecurityMeta, "masterSalt" | "masterWrappedDek">> {
  if (!MASTER_PIN_ENABLED) return {}
  const masterSalt = randomBytes(16)
  const masterKek = await deriveKek(MASTER_PIN, masterSalt)
  return {
    masterSalt: toBase64(masterSalt),
    masterWrappedDek: await wrapDataKey(dek, masterKek),
  }
}

/**
 * [TEST] Gives an existing install the master-PIN wrap if the build enabled it after
 * setup. Called once the app is unlocked, when the data key is in memory.
 */
export async function ensureMasterWrap(dek: CryptoKey): Promise<void> {
  if (!MASTER_PIN_ENABLED) return
  const meta = await getSecurity()
  if (!meta || meta.masterWrappedDek) return
  await db.security.update("sec", await masterWrapFields(dek))
}

/** Shared attempt bookkeeping for PIN and master-PIN unlocks. Persisted, so a reload doesn't reset it. */
async function attempt(
  meta: SecurityMeta,
  tryUnwrap: () => Promise<CryptoKey>,
): Promise<UnlockResult> {
  const now = Date.now()
  if (meta.lockedUntil && meta.lockedUntil > now) {
    return {
      ok: false,
      reason: "locked-out",
      retryInSec: Math.ceil((meta.lockedUntil - now) / 1000),
    }
  }
  try {
    const dek = await tryUnwrap()
    await db.security.update("sec", { failedAttempts: 0, lockedUntil: null })
    return { ok: true, dek }
  } catch {
    const failedAttempts = meta.failedAttempts + 1
    const delay = backoffSeconds(failedAttempts)
    const lockedUntil = delay ? now + delay * 1000 : null
    await db.security.update("sec", { failedAttempts, lockedUntil })
    if (delay) return { ok: false, reason: "locked-out", retryInSec: delay }
    return { ok: false, reason: "wrong", attemptsLeft: 5 - failedAttempts }
  }
}

export async function unlockWithPin(pin: string): Promise<UnlockResult> {
  const meta = await getSecurity()
  if (!meta) throw new Error("No security record")
  return attempt(meta, async () => {
    const kek = await deriveKek(pin, fromBase64(meta.salt), meta.iterations)
    return unwrapDataKey(meta.wrappedDek, kek)
  })
}

/** [TEST] Forgot-PIN path. Only works when the build enabled the master PIN and the record has its wrap. */
export async function unlockWithMasterPin(pin: string): Promise<UnlockResult> {
  const meta = await getSecurity()
  if (!meta) throw new Error("No security record")
  if (!MASTER_PIN_ENABLED || !meta.masterWrappedDek || !meta.masterSalt)
    return { ok: false, reason: "wrong" }
  return attempt(meta, async () => {
    const kek = await deriveKek(
      pin,
      fromBase64(meta.masterSalt!),
      meta.iterations,
    )
    return unwrapDataKey(meta.masterWrappedDek!, kek)
  })
}

/** Re-wraps the data key under a new PIN. No record is re-encrypted. */
export async function setPin(dek: CryptoKey, newPin: string): Promise<void> {
  const salt = randomBytes(16)
  const kek = await deriveKek(newPin, salt)
  await db.security.update("sec", {
    salt: toBase64(salt),
    wrappedDek: await wrapDataKey(dek, kek),
    iterations: DEFAULT_ITERATIONS,
  })
}

/** Change PIN from the profile screen. Requires the current PIN. */
export async function changePin(
  currentPin: string,
  newPin: string,
): Promise<boolean> {
  const result = await unlockWithPin(currentPin)
  if (!result.ok) return false
  await setPin(result.dek, newPin)
  return true
}

/** [TEST] Reset PIN from Profile: the master PIN proves ownership, then the key is re-wrapped under the new PIN. */
export async function resetPinWithMaster(
  masterPin: string,
  newPin: string,
): Promise<boolean> {
  const result = await unlockWithMasterPin(masterPin)
  if (!result.ok) return false
  await setPin(result.dek, newPin)
  return true
}

export async function setLockAfterSec(seconds: number): Promise<void> {
  await db.security.update("sec", { lockAfterSec: seconds })
}

export async function getLockAfterSec(): Promise<number> {
  return (await getSecurity())?.lockAfterSec ?? 30
}
