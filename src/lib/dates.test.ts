import { describe, expect, it } from "vitest"
import {
  daysIn,
  daysInMonthOf,
  fromDay,
  inPeriod,
  periodOf,
  shiftAnchor,
  toDay,
} from "./dates"

describe("periods", () => {
  it("starts weeks on Monday when configured", () => {
    const wed = fromDay("2026-10-21")
    expect(toDay(periodOf("week", wed, 1).start)).toBe("2026-10-19")
    expect(toDay(periodOf("week", wed, 0).start)).toBe("2026-10-18")
  })

  it("covers a whole month inclusive", () => {
    const period = periodOf("month", fromDay("2026-02-10"))
    expect(daysIn(period)).toHaveLength(28)
    expect(inPeriod("2026-02-28", period)).toBe(true)
    expect(inPeriod("2026-03-01", period)).toBe(false)
  })

  it("shifts anchors by whole periods", () => {
    expect(toDay(shiftAnchor("month", fromDay("2026-03-31"), -1))).toBe(
      "2026-02-28",
    )
    expect(toDay(shiftAnchor("year", fromDay("2026-06-01"), -1))).toBe(
      "2025-06-01",
    )
  })

  it("knows month lengths", () => {
    expect(daysInMonthOf("2028-02-01")).toBe(29)
    expect(daysInMonthOf("2026-02-01")).toBe(28)
  })
})
