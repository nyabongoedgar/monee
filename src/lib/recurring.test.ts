import { describe, expect, it } from "vitest"
import { advanceDue, anchorDayOf } from "./recurring"

describe("advanceDue", () => {
  it("moves weekly items by seven days", () => {
    expect(advanceDue("2026-12-28", "weekly", 28)).toBe("2027-01-04")
  })

  it("clamps month-end and then returns to the anchor day", () => {
    // Anchor is the 31st. February clamps to the 28th, then March goes back to the 31st.
    expect(advanceDue("2026-01-31", "monthly", 31)).toBe("2026-02-28")
    expect(advanceDue("2026-02-28", "monthly", 31)).toBe("2026-03-31")
    expect(advanceDue("2026-03-31", "monthly", 31)).toBe("2026-04-30")
  })

  it("handles leap days for yearly items", () => {
    expect(advanceDue("2028-02-29", "yearly", 29)).toBe("2029-02-28")
    expect(advanceDue("2029-02-28", "yearly", 29)).toBe("2030-02-28")
    expect(advanceDue("2032-02-29", "yearly", 29)).toBe("2033-02-28")
  })

  it("takes the anchor from the start date", () => {
    expect(anchorDayOf("2026-10-15")).toBe(15)
  })
})
