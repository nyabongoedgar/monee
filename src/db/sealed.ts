import { requireDek } from "@/security/session"
import { openJson, sealJson } from "@/security/crypto"

type Loose = Record<string, unknown>

/** Splits a record into clear index fields and one encrypted `sealed` blob. */
export async function toRow<T extends object>(
  record: T,
  secretKeys: readonly (keyof T & string)[],
): Promise<Loose> {
  const clear: Loose = {}
  const secret: Loose = {}
  for (const [key, value] of Object.entries(record)) {
    if (value === undefined) continue
    if ((secretKeys as readonly string[]).includes(key)) secret[key] = value
    else clear[key] = value
  }
  return { ...clear, sealed: await sealJson(requireDek(), secret) }
}

/** Reassembles a decrypted record from a stored row. */
export async function fromRow<T>(row: Loose & { sealed: string }): Promise<T> {
  const { sealed, ...clear } = row
  const secret = await openJson<Loose>(requireDek(), sealed)
  return { ...clear, ...secret } as T
}
