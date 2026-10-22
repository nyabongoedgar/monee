// @vitest-environment node
import { describe, expect, it } from "vitest"
import {
  deriveKek,
  generateDataKey,
  openJson,
  sealJson,
  unwrapDataKey,
  wrapDataKey,
  randomBytes,
  DEFAULT_ITERATIONS,
} from "./crypto"
import { backoffSeconds } from "./pin"

// Lower cost in tests. Production uses DEFAULT_ITERATIONS.
const FAST = 1000

describe("key wrapping", () => {
  it("unwraps the data key with the right PIN", async () => {
    const salt = randomBytes(16)
    const dek = await generateDataKey()
    const kek = await deriveKek("1234", salt, FAST)
    const wrapped = await wrapDataKey(dek, kek)
    const again = await unwrapDataKey(
      wrapped,
      await deriveKek("1234", salt, FAST),
    )

    const sealed = await sealJson(dek, { amount: 4200, note: "Lunch" })
    expect(await openJson(again, sealed)).toEqual({
      amount: 4200,
      note: "Lunch",
    })
  })

  it("rejects a wrong PIN (GCM authentication fails)", async () => {
    const salt = randomBytes(16)
    const dek = await generateDataKey()
    const wrapped = await wrapDataKey(dek, await deriveKek("1234", salt, FAST))
    await expect(
      unwrapDataKey(wrapped, await deriveKek("4321", salt, FAST)),
    ).rejects.toThrow()
  })

  it("re-wrapping under a new PIN keeps the same data readable", async () => {
    const dek = await generateDataKey()
    const sealed = await sealJson(dek, { amount: 77 })
    const salt2 = randomBytes(16)
    const rewrapped = await wrapDataKey(
      dek,
      await deriveKek("9999", salt2, FAST),
    )
    const unwrapped = await unwrapDataKey(
      rewrapped,
      await deriveKek("9999", salt2, FAST),
    )
    expect(await openJson(unwrapped, sealed)).toEqual({ amount: 77 })
  })

  it("uses a production-strength default", () => {
    expect(DEFAULT_ITERATIONS).toBeGreaterThanOrEqual(600_000)
  })
})

describe("PIN back-off", () => {
  it("allows four free attempts, then 30s, 1m, 5m and so on", () => {
    expect([0, 1, 2, 3, 4].map(backoffSeconds)).toEqual([0, 0, 0, 0, 0])
    expect([5, 6, 7, 8, 9, 10, 11].map(backoffSeconds)).toEqual([
      30, 60, 300, 900, 1800, 3600, 3600,
    ])
  })
})
